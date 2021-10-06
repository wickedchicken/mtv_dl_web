import { html, Component, render } from '/static/js/preact.js';

const debounce = (func, delay) => {
  let inDebounce
  return function() {
    const context = this
    const args = arguments
    clearTimeout(inDebounce)
    inDebounce = setTimeout(() => func.apply(context, args), delay)
  }
}

function Toggle(props) {
  if (props.state.toggle == props.desired_state) {
    if (props.state.value != '') {
      return html`<b>${props.desired_state}</b>`
    }
    return html`${props.desired_state}`
  }
  return html`<a onclick=${() => {props.onToggle(props.desired_state)}}>${props.desired_state}</a>`
}

function PageList(props) {
  function slice_page_array(page_array) {
    if (props.pages <= props.pagesToDisplay) {
      return page_array;
    }

    // this may break if pagesToDisplay is not even...
    const halfway = props.pagesToDisplay / 2;

    // handle special case where it's one more page than we want, then the ... don't make sense
    const dots = ((props.pages == (props.pagesToDisplay + 1)) ? '' : '...');
    const lefthandside_link = [html`<a onclick=${() => {jump_to_page(1)}}>1</a> ${dots} `]
    const righthandside_link = [html`${dots} <a onclick=${() => {jump_to_page(props.pages)}}>${props.pages}</a> `]

    if (props.page <= (halfway + 1)) {
      return page_array.slice(0, props.pagesToDisplay).concat(righthandside_link)
    }

    if (props.page >= ((props.pages - halfway) - 1)) {
      return lefthandside_link.concat(page_array.slice(props.pages - props.pagesToDisplay))
    }

    return lefthandside_link.concat(page_array.slice(props.page - halfway, props.page + halfway)).concat(righthandside_link);
  }

  function jump_to_page(page) {
    props.pageListSetState({ page: page, query_filters: props.queryFilters});
  }

  function render_link(page) {
    if (props.page == page) {
      return html`${page} `
    } else {
      return html`<a onclick=${() => {jump_to_page(page)}}>${page}</a> `
    }
  }

  if (props.pages < 2) {
    return [];
  }

  const page_array = [...Array(props.pages).keys()].map(i => {return render_link(i+1)});
  return [html`Pages of results: `].concat(slice_page_array(page_array))
}

class SearchField extends Component {
  state = {
    value: "",
  }

  onInput = e => {
    const { value } = e.target;
    this.setState({ value });
    var new_filter_state = this.props.oldstate()['query_filters'];
    new_filter_state[this.props.name] = this.props.name + '=' + value;
    this.props.searchListSetState({ query_filters: new_filter_state })
  }

  render(props, state) {
    return (
      html`
        <td>
          <input type="text" value=${state.value} onInput=${debounce(this.onInput, 1000)} />
        </td>
      `
    );
  }
}

class DateSearchField extends SearchField {
  state = {
    toggle: "",
    value: "",
  }


  compute_filter_state(value, toggle) {
    if (toggle == 'after') {
      return 'start+' + value;
    }
    if (toggle == 'before') {
      return 'start-' + value;
    }
    return '';
  }

  setFilterState(value, toggle) {
    var new_filter_state = this.props.oldstate()['query_filters'];
    new_filter_state[this.props.name] = this.compute_filter_state(value, toggle);
    this.props.searchListSetState({ query_filters: new_filter_state })
  }

  onInput = e => {
    const { value } = e.target;
    this.setState({ value });
    this.setFilterState(value, this.state.toggle)
  }

  onToggle = toggle => {
    this.setState({ 'toggle': toggle });
    this.setFilterState(this.state.value, toggle)
  }

  render(props, state) {
    return (
      html`
        <td>
          <input type="text" value=${state.value} onInput=${debounce(this.onInput, 1000)} />
          <table>
          <tr>
          <td> <${Toggle} desired_state="before" state=${this.state} onToggle=${this.onToggle}/></td>
          <td><${Toggle} desired_state="after" state=${this.state} onToggle=${this.onToggle}/></td>
          </tr>
          </table>
        </td>
      `
    );
  }
}

class SearchList extends Component {
  state = {
    list: [],
    title: "",
    query_filters: {},
    queries_in_progress: 0,
    page: 1,
    pages: 1,
    item_count: 0,
  }

  async queryList(rules, page) {
    const resultsperpage = this.props.resultsPerPage;
    async function inner_query() {
      const rawResponse = await fetch('/query', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          limit: resultsperpage,
          rules: rules,
          page: page,
        })
      });
      return await rawResponse.json();
    }
    let content = await inner_query();
    while (('busy' in content) && (this.is_active_query(rules))) {
      // todo: sleep!!!
      content = await inner_query();
    }
    if ('result' in content) {
      // prevent race condition by only setting state if the result comes from the actively set query
      if (this.is_active_query(rules)) {
        this.setState({
          list: content['result'],
          page: content['page'],
          pages: content['last_page'],
          item_count: content['item_count'],
          queries_in_progress: 0,
        })
      }
    }
  }

  make_rules(query_filters) {
    return Object.entries(query_filters).sort().filter(x => x[1].length > 0).map(x => x[1]);
  }

  is_active_query(expected_rules) {
    // once I'm off the plane, see if there is a better way to check for dict or list equality
    const current = this.make_rules(this.state.query_filters);
    if (expected_rules.length != current.length) {
      return false;
    }
    // :(
    let i = 0;
    while (i < expected_rules.length) {
      if (expected_rules[i] != current[i]) {
        return false;
      }
      i++;
    }
    return true;
  }

  async onSubmit(query_filters, page) {
    if (Object.values(query_filters).every(x => !x)) {
      this.setState({item_count: 0, list: [], page:0, pages:0});
      return;
    }
    this.setState({queries_in_progress: 1});
    const rules = this.make_rules(query_filters);
    this.queryList(rules, page);
  }

  linkHandler(p) {
    this.setState(p);
    this.onSubmit(p.query_filters, p.page)
  }

  inputHandler(p) {
    this.setState(p);
    this.onSubmit(p.query_filters, 1);
  }

  render(props, { value }) {
    const current_lower_bound = (this.state.item_count == 0) ? 0 : ((this.state.page - 1) * props.resultsPerPage) + 1;
    const current_upper_bound = Math.min(
      this.state.item_count,
      this.state.page * props.resultsPerPage);

    return (
      html`
      ${(this.state.queries_in_progress > 0) ? html`<progress class="progress is-small is-primary" max="100">15%</progress>` : html`<div></div>`}
      <p>results found (${current_lower_bound}-${current_upper_bound} out of ${this.state.item_count}) <${PageList} pageListSetState=${p=>{this.linkHandler(p)}} pages=${this.state.pages} pagesToDisplay=${10} page=${this.state.page} queryFilters=${this.state.query_filters}/></p>
      <table class="table is-striped is-hoverable is-bordered is-fullwidth">
      <tr>
        <th>Title</th>
        <th>Channel</th>
        <th>Date</th>
        <th>Duration</th>
        <th>Topic</th>
      </tr>
      <tr>
        <${SearchField} name="title" oldstate=${()=>{return this.state}} searchListSetState=${p=>{this.inputHandler(p)}} />
        <${SearchField} name="channel" oldstate=${()=>{return this.state}} searchListSetState=${p=>{this.inputHandler(p)}} />
        <${DateSearchField} name="start" oldstate=${()=>{return this.state}} searchListSetState=${p=>{this.inputHandler(p)}} />
        <${SearchField} name="duration" oldstate=${()=>{return this.state}} searchListSetState=${p=>{this.inputHandler(p)}} />
        <${SearchField} name="topic" oldstate=${()=>{return this.state}} searchListSetState=${p=>{this.inputHandler(p)}} />
      </tr>
      ${this.state.list.map(element => html`
      <tr>
        <td>${element['title']}</td>
        <td>${element['channel']}</td>
        <td>${element['start']}</td>
        <td>${element['duration']}</td>
        <td>${element['topic']}</td>
      </tr>
      `)}
      </table>
      `
    );
  }
}

class DatabaseStatus extends Component {
  state = { database_status: "connecting to server" };

  // Called whenever our component is created
  async componentDidMount() {
    this.timer = setInterval(async () => {
      const database_status_fetch = await fetch('/database_status');
      const status_text = await database_status_fetch.text();
      // update status every second
      this.setState({database_status: status_text});
    }, 1000);
  }

  // Called just before our component will be destroyed
  componentWillUnmount() {
    // stop when not renderable
    clearInterval(this.timer);
  }

  async refresh() {
    this.setState({database_status: "requesting database refresh" });
    const database_status_fetch = await fetch('/refresh_database', {method: 'POST'});
    const status_text = await database_status_fetch.text();
  }

  render(props, state) {
    return html`<span>${this.state.database_status}</span>`;
  }
}

class App extends Component {
  database_status_ref = null;
  setDatabaseStatusRef = (dom) => this.database_status_ref = dom;

  addTodo() {
    const { todos = [] } = this.state;
    this.setState({ todos: todos.concat(`Item ${todos.length}`) });
  }

  render(props, state) {
    return html`
      <div class="app">
        <div class="m-2">
          <div class="columns">
            <div class="column is-half">
              <${Header} />
            </div>
            <div class="column is-half">
              <div class="has-text-right">
                <span class="mr-3">
                  <${DatabaseStatus} ref=${this.setDatabaseStatusRef} />
                </span>
                <button onClick=${() => this.database_status_ref.refresh()}>Refresh Database</button>
              </div>
            </div>
          </div>
          <div class="columns">
            <div class="column is-full">
              <${SearchList} resultsPerPage=10 />
            </div>
          </div>
          <div class="columns">
            <div class="column is-full">
              <${Footer}>Served by <a href="https://github.com/wickedchicken/mtv_dl_web">mtv_dl_web</a>.<//>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

const Header = () => html`<p>Mediathek Search</p>`

const Footer = props => html`<footer ...${props} />`