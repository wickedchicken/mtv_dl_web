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

class SearchField extends Component {
  state = {
    value: "",
  }

  onInput = e => {
    const { value } = e.target;
    this.setState({ value });
    var new_filter_state = this.props.oldstate()['query_filters'];
    new_filter_state[this.props.name] = value;
    this.props.searchListSetState({ query_filters: new_filter_state })
  }

  render(props, state) {
    return (
      html`
        <td>
          <input type="text" value=${state.value} onInput=${this.onInput} />
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
  }

  async queryList(rules) {
    const resultsperpage = this.props.resultsPerPage;
    console.log('yyyeahhh');
    console.log(resultsperpage);
    async function inner_query() {
      const rawResponse = await fetch('/query', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({limit: resultsperpage, rules: rules})
      });
      return await rawResponse.json();
    }
    const content = await inner_query();
    console.log(content);
    if ('result' in content) {
      console.log(content['result']);
      this.setState({list: content['result']})
    }
  }

  async onSubmit() {
    this.setState({queries_in_progress: 1})
    const query_filters = this.state.query_filters;
    console.log(query_filters);
    const result = Object.entries(query_filters).filter(x => x[1].length > 0).map(x => x[0] + x[1]);
    console.log(result);
    await this.queryList(result);
    this.setState({queries_in_progress: 0})
  }

  inputHandler(p) {
    this.setState(p);
    debounce(this.onSubmit(), 100);
  }

  render(props, { value }) {
    return (
      html`
      ${(this.state.queries_in_progress > 0) ? html`<progress class="progress is-small is-primary" max="100">15%</progress>` : html`<div>hi</div>`}
      <table class="table is-striped is-hoverable is-bordered">
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
        <${SearchField} name="start" oldstate=${()=>{return this.state}} searchListSetState=${p=>{this.inputHandler(p)}} />
        <${SearchField} name="duration" oldstate=${()=>{return this.state}} searchListSetState=${p=>{this.inputHandler(p)}} />
        <${SearchField} name="topic" oldstate=${()=>{return this.state}} searchListSetState=${p=>{this.inputHandler(p)}} />
      </tr>
      <p>results found (limit ${props.resultsPerPage}): ${this.state.list.length}</p>
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

  render({ page }, { todos = [] }) {
    return html`
      <div class="app">
        <${DatabaseStatus} ref=${this.setDatabaseStatusRef} />
        <${Header} name="ToDo's (${page})" />
        <ul>
          ${todos.map(todo => html`
            <li key="${todo}">${todo}</li>
          `)}
        </ul>
        <button onClick=${() => this.database_status_ref.refresh()}>Refresh Database</button>
        <${SearchList} resultsPerPage=10 />
        <${Footer}>footer content here<//>
      </div>
    `;
  }
}

const Header = ({ name }) => html`<h1>${name} List</h1>`

const Footer = props => html`<footer ...${props} />`