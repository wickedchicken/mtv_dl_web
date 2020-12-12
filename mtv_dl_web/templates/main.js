class SearchList extends Component {
  state = { list: '' };

  async queryList() {
    async function inner_query() {
      const rawResponse = await fetch('/query', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({limit: 10, rules: ['title=Wart', 'channel=ARD']})
      });
      return await rawResponse.json();
    }
    const content = await inner_query();
    console.log('yo');
    console.log(content);
    if ('result' in content) {
      this.setState({list: content['result']})
    }
  }

  onSubmit = async(e) => {
    e.preventDefault();
    await this.queryList();
  }

  onInput = e => {
    const { value } = e.target;
    this.setState({ value })
  }

  render(_, { value }) {
    return (
      html`
      <form onSubmit=${this.onSubmit}>
        <input type="text" value=${value} onInput=${this.onInput} />
        <p>You typed this value: ${value}</p>
        <button type="submit">Submit</button>
      </form>
      <span>${this.state.list}</span>
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
        <${SearchList}/>
        <${Footer}>footer content here<//>
      </div>
    `;
  }
}

const Header = ({ name }) => html`<h1>${name} List</h1>`

const Footer = props => html`<footer ...${props} />`