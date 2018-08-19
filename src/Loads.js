import { Component } from 'react';
import { type LoadPolicy } from './_types';
import { EVENTS, STATES } from './statechart';
import { LOAD_POLICIES, getCachedResponseFromProps } from './utils';

type Props = {
  enableBackgroundStates?: boolean,
  cacheKey?: string,
  cache?: {
    error?: any,
    response?: any,
    state?: ?(STATES.SUCCESS | STATES.ERROR)
  },
  children: ({
    state: string,
    error: any,
    response: any,
    isError: boolean,
    isIdle: boolean,
    isLoading: boolean,
    isSuccess: boolean,
    isTimeout: boolean,
    load: (...args: any) => ?Promise<any>,
    resetState: () => void
  }) => any,
  delay?: number,
  isErrorSilent?: boolean,
  loadOnMount?: boolean,
  loadPolicy?: LoadPolicy,
  fn: (...args: any) => Promise<any>,
  machineState: { value: string },
  setResponse?: (data: { error?: any, response?: any }) => void,
  timeout?: number,
  transition: (state: string) => void
};
type State = {
  cacheKey?: string,
  error: any,
  hasResponseInCache: boolean,
  response: any
};

export default class Loads extends Component<Props, State> {
  static defaultProps = {
    enableBackgroundStates: false,
    delay: 300,
    timeout: 0,
    error: null,
    isErrorSilent: true,
    loadOnMount: false,
    loadPolicy: LOAD_POLICIES.CACHE_AND_LOAD,
    response: null
  };
  _delayTimeout: any;
  _timeoutTimeout: any;
  _mounted: boolean;
  _paused: boolean;

  state = {
    cacheKey: this.props.cacheKey,
    ...getCachedResponseFromProps(this.props)
  };

  static getDerivedStateFromProps = (nextProps: Props, state: State) => {
    if (nextProps.cacheKey !== state.cacheKey) {
      return {
        cacheKey: nextProps.cacheKey,
        ...getCachedResponseFromProps(nextProps)
      };
    }
    return {};
  };

  componentDidMount = () => {
    const { loadOnMount } = this.props;
    this._mounted = true;
    if (loadOnMount) {
      this.handleLoad();
    }
  };

  componentDidUpdate = prevProps => {
    const { cacheKey: prevCacheKey } = prevProps;
    const { cacheKey, loadOnMount } = this.props;

    if (cacheKey && cacheKey !== prevCacheKey) {
      if (loadOnMount) {
        this.handleLoad();
      }
    }
  };

  componentWillUnmount = () => {
    this._clearTimeouts();
    this._mounted = false;
  };

  _clearTimeouts = () => {
    clearTimeout(this._delayTimeout);
    clearTimeout(this._timeoutTimeout);
  };

  _setTimeouts = () => {
    const { delay, timeout } = this.props;
    if (delay) this._paused = true;
    this._delayTimeout = setTimeout(() => {
      this._paused = false;
      this.transition(EVENTS.FETCH);
    }, delay);
    if (timeout) {
      this._timeoutTimeout = setTimeout(() => {
        this.transition(EVENTS.TIMEOUT);
        this._clearTimeouts();
      }, timeout);
    }
  };

  handleLoad = (...args: any) => {
    const { isErrorSilent, fn, loadPolicy } = this.props;
    const { hasResponseInCache } = this.state;
    if (loadPolicy === LOAD_POLICIES.CACHE_FIRST && hasResponseInCache) return null;
    if (this._paused) return null;
    this._setTimeouts();
    return fn(...args)
      .then(response => {
        this.handleResponse({ response, event: EVENTS.SUCCESS });
        return response;
      })
      .catch(err => {
        this.handleResponse({ error: err, event: EVENTS.ERROR });
        if (!isErrorSilent) {
          throw err;
        }
      });
  };

  handleResponse = ({ error, event, response }: { error?: any, event: EVENTS.SUCCESS | EVENTS.ERROR, response?: any }) => { // eslint-disable-line
    const { setResponse } = this.props;
    if (!this._mounted) {
      return;
    }
    const value = {
      ...(event === EVENTS.SUCCESS ? { response } : {}),
      ...(event === EVENTS.ERROR ? { error } : {})
    };
    this._clearTimeouts();
    this._paused = false;
    this.setState(value);
    setResponse &&
      setResponse({
        ...value,
        ...(event === EVENTS.SUCCESS ? { state: STATES.SUCCESS } : {}),
        ...(event === EVENTS.ERROR ? { state: STATES.ERROR } : {})
      });
    this.transition(event);
  };

  transition = (event: string) => {
    const { transition } = this.props;
    if (!this._mounted) {
      return;
    }
    transition(event);
  };

  render = () => {
    const { enableBackgroundStates, cache, children, machineState } = this.props;
    const { error, hasResponseInCache, response } = this.state;
    const cachedState = cache ? cache.state : null;
    const state = machineState.value;
    const props = {
      state,
      error,
      response,
      hasResponseInCache,
      isIdle: state === STATES.IDLE && (!hasResponseInCache || enableBackgroundStates),
      isLoading: state === STATES.LOADING && (!hasResponseInCache || enableBackgroundStates),
      isTimeout: state === STATES.TIMEOUT && (!hasResponseInCache || enableBackgroundStates),
      isSuccess: state === STATES.SUCCESS || (hasResponseInCache && cachedState === STATES.SUCCESS),
      isError: state === STATES.ERROR || (hasResponseInCache && cachedState === STATES.ERROR),
      load: this.handleLoad,
      resetState: () => this.transition(EVENTS.RESET)
    };
    return children(props);
  };
}