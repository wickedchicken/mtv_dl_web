#!/usr/bin/env python3

import asyncio
import concurrent.futures
import json
import os
from pathlib import Path
from quart import abort, jsonify
from quart import render_template

from mtv_dl import (
    FILMLISTE_DATABASE_FILE,
    HISTORY_DATABASE_FILE,
    Database,
    serialize_for_json,
)
from quart import Quart

SQLITE_POOL_EXECUTOR = concurrent.futures.ThreadPoolExecutor(max_workers=1)

LOADING_DATABASE = asyncio.Event()
REFRESHING_DATABASE = asyncio.Event()
DATABASE_LOCK = asyncio.Lock()

SHOWLIST = None


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
        LOADING_DATABASE.clear()


async def refresh_database():
    if not REFRESHING_DATABASE.is_set():
        REFRESHING_DATABASE.set()
        async with DATABASE_LOCK:

            def inner_func():
                SHOWLIST.initialize_if_old(refresh_after=3)

            await run_in_sqlite_pool(inner_func)
        REFRESHING_DATABASE.clear()

async def query_database(rules, limit=10):
    def inner_func():
        return list(SHOWLIST.filtered(rules=rules, limit=limit))

    return await asyncio.get_running_loop().run_in_executor(
        SQLITE_POOL_EXECUTOR, inner_func
    )


app = Quart(__name__)


@app.before_serving
async def refresh_database_on_startup():
    async def inner_func():
        await load_database()
        await refresh_database()

    asyncio.create_task(inner_func())


@app.after_serving
async def close_sqlite_pool_executor():
    if shutdownobj := SQLITE_POOL_EXECUTOR.shutdown(wait=True):
        await shutdownobj


@app.route("/query")
async def query_database():
    if content is None:
        abort(400)
    if LOADING_DATABASE.is_set():
        abort(422)
    elif REFRESHING_DATABASE.is_set():
        abort(422)
    else:
        shows = await query_database(request.json['filters'])
        return jsonify(shows, default=serialize_for_json)



# @app.route("/info")
# async def hello():
#     if LOADING_DATABASE.is_set():
#         return "loading database"
#     elif REFRESHING_DATABASE.is_set():
#         return "refreshing database"
#     else:
#         return json.dumps(, default=serialize_for_json, indent=4, sort_keys=True)

@app.route("/")
async def hello():
    return await render_template('index.html')


app.run()
