#!/usr/bin/env python3

import asyncio
import concurrent.futures
import json
import os
from pathlib import Path

from asyncache import cached
from cachetools import LRUCache
from mtv_dl import (
    FILMLISTE_DATABASE_FILE,
    HISTORY_DATABASE_FILE,
    Database,
    serialize_for_json,
)
from paginate import Page
from quart import Quart, abort, jsonify, render_template, request

SQLITE_POOL_EXECUTOR = concurrent.futures.ThreadPoolExecutor(max_workers=1)

LOADING_DATABASE = None
REFRESHING_DATABASE = None
DATABASE_LOCK = None

SHOWLIST = None

DATABASE_QUERY_CACHE = LRUCache(maxsize=32 * 1024)
DATABASE_QUERY_PAGE_CACHE = LRUCache(maxsize=32 * 1024)


async def run_in_sqlite_pool(func):
    return await asyncio.get_running_loop().run_in_executor(SQLITE_POOL_EXECUTOR, func)


async def load_database():
    if not LOADING_DATABASE.is_set():
        LOADING_DATABASE.set()
        global SHOWLIST
        cw_dir = Path(os.getcwd())
        async with DATABASE_LOCK:

            def inner_func():
                return Database(
                    filmliste=cw_dir / FILMLISTE_DATABASE_FILE,
                    history=cw_dir / HISTORY_DATABASE_FILE,
                )

            SHOWLIST = await run_in_sqlite_pool(inner_func)
            DATABASE_QUERY_CACHE.clear()
            DATABASE_QUERY_PAGE_CACHE.clear()
        LOADING_DATABASE.clear()


async def refresh_database():
    if not REFRESHING_DATABASE.is_set():
        REFRESHING_DATABASE.set()
        async with DATABASE_LOCK:

            def inner_func():
                SHOWLIST.initialize_if_old(refresh_after=3)

            await run_in_sqlite_pool(inner_func)
        REFRESHING_DATABASE.clear()


@cached(cache=DATABASE_QUERY_CACHE)
def query_database_inner(rules, limit=10000):
    return list(SHOWLIST.filtered(rules=rules, limit=limit))


@cached(cache=DATABASE_QUERY_PAGE_CACHE)
async def query_database(rules, page, items_per_page=20, limit=10000, sort_field=None, sort_direction=None):
    def inner_func():
        show_list = query_database_inner(rules=rules, limit=limit)
        print(show_list[1])
        if sort_field and sort_direction:
            show_list.sort(key=lambda x: x[sort_field])
            if sort_direction == 'v':
                show_list.reverse()
        return Page(show_list, page=page, items_per_page=items_per_page)

    return await run_in_sqlite_pool(inner_func)


app = Quart(__name__)


@app.before_serving
async def refresh_database_on_startup():
    global LOADING_DATABASE
    global REFRESHING_DATABASE
    global DATABASE_LOCK

    LOADING_DATABASE = asyncio.Event()
    REFRESHING_DATABASE = asyncio.Event()
    DATABASE_LOCK = asyncio.Lock()

    async def inner_func():
        await load_database()
        await refresh_database()

    asyncio.create_task(inner_func())


@app.after_serving
async def close_sqlite_pool_executor():
    if shutdownobj := SQLITE_POOL_EXECUTOR.shutdown(wait=True):
        await shutdownobj


@app.route("/database_status")
async def database_status():
    if LOADING_DATABASE.is_set():
        return "loading database"
    elif REFRESHING_DATABASE.is_set():
        return "refreshing database"
    else:
        return "database ready"


@app.route("/refresh_database", methods=["POST"])
async def refresh_database_route():
    asyncio.create_task(refresh_database())
    return "refreshing database"


@app.route("/query", methods=["POST"])
async def query():
    body_json = await request.get_json()

    sort_field = body_json.get("sort_field")
    allowed_field_list = ('title', 'channel', 'start', 'duration', 'topic')
    if sort_field and sort_field not in allowed_field_list:
        abort(400, "sort_field must be one of {}".format(allowed_field_list))
    sort_direction = body_json.get("sort_direction")
    if sort_direction and sort_direction not in ('v', '^'):
        abort(400, "sort_direction must be one of 'v' or '^'")
    rules = body_json.get("rules", [])
    limit = int(body_json.get("limit", 10))
    page = int(body_json.get("page", 1))
    if page < 0:
        abort(400, "page cannot be below 1")

    if LOADING_DATABASE.is_set():
        return jsonify({"busy": "loading database"})
    elif REFRESHING_DATABASE.is_set():
        return jsonify({"busy": "refreshing database"})
    else:
        database_lock = DATABASE_LOCK
        try:
            await asyncio.wait_for(database_lock.acquire(), timeout=1.0)
            try:
                # todo: use jsonify
                results = await query_database(
                    tuple(rules), page=page, items_per_page=limit,
                    sort_field=sort_field, sort_direction=sort_direction,
                )
                return json.dumps(
                    {
                        "result": results.items,
                        "last_page": results.last_page,
                        "item_count": results.item_count,
                        "page": results.page,
                    },
                    default=serialize_for_json,
                    indent=4,
                    sort_keys=True,
                )
            finally:
                database_lock.release()
        except asyncio.TimeoutError:
            return jsonify({"busy": "performing database operations"})


@app.route("/")
async def hello():
    return await render_template("index.html")


app.run(debug=True)
