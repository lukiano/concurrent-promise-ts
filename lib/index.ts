(Symbol as any).asyncIterator = Symbol.asyncIterator || Symbol.for('asyncIterator');

export function all<T, U>(it: Iterable<T> | AsyncIterable<T>, f: (t: T) => Promise<U>, concurrency = 32, backPressure = false): Promise<Array<U>> {
  const gen = generate(it, f, concurrency, backPressure);
  const results = new Array<U>();
  return accumulate(gen[Symbol.asyncIterator](), results).then(() => results);
}

function accumulate<U>(ait: AsyncIterator<U>, results: Array<U>): Promise<void> {
  return ait.next().then((result) => {
    if (result.value) {
      results.push(result.value);
    }
    if (!result.done) {
      return accumulate(ait, results);
    }
    return Promise.resolve();
  });
}

export function generate<T, U>(it: Iterable<T> | AsyncIterable<T>, f: (t: T) => Promise<U>, concurrency: number, backPressure: boolean): AsyncIterable<U> {
  if (isIterable(it)) {
    it = iterable2asyncIterable(it);
  }
  if (isAsyncIterable(it)) {
    return {
      [Symbol.asyncIterator](): AsyncIterator<U> {
        const gen = it as AsyncIterable<T>;
        return new Queue(gen[Symbol.asyncIterator](), f, concurrency, backPressure);
      }
    };
  }
  // Return failure iterator
  return {
    [Symbol.asyncIterator](): AsyncIterator<U> {
      return {
        next: () => Promise.reject(new Error('Unrecognized source of data'))
      };
    }
  };
}

type Consumer<T> = {
  resolve: (t: IteratorResult<T>) => void;
  reject: (err: Error) => void;
};

class Queue<T, U> implements AsyncIterator<U> {

  private _producersInProgress = 0;
  private readonly _resultsReadyToConsume = new Array<U>();
  private readonly _waitingConsumers = new Array<Consumer<U>>();
  private readonly _nextValues = Array<any>();
  private _producerFinished = false;

  constructor(private readonly _ait: AsyncIterator<T>,
    private readonly _f: (t: T) => Promise<U>,
    private readonly _concurrency: number,
    private readonly _backPressure: boolean) {
    if (!this._backPressure) {
      this._tryToFireMoreWork();
    }
  }

  next(value?: any): Promise<IteratorResult<U>> {
    return this._doNext(value);
  }

  // finish iterator and ignore remaining results
  return?(value?: U): Promise<IteratorResult<U>> {
    this._producerFinished = true;
    return this._doNext(value).then((result) => buildResult(true, result.value ? result.value : value));
  }

  throw?(_e?: any): Promise<IteratorResult<U>> {
    // We don't pass the throw to the original generator.
    // throw does not finish the iteration.
    return this.next();
  }

  private _invarianceCheck(): void {
    if (this._resultsReadyToConsume.length > 0 && this._waitingConsumers.length > 0) {
      this._producerError(new Error('Invariance failed'));
    }
  }

  private _doNext(value?: any): Promise<IteratorResult<U>> {
    this._invarianceCheck();

    if (this._resultsReadyToConsume.length > 0) {
      const result = this._resultsReadyToConsume.shift()!;
      this._log('I will consume', result);
      this._nextValues.push(value);
      this._tryToFireMoreWork();
      return Promise.resolve(buildResult(false, result));
    }
    if (this._producerFinished && this._producersInProgress === 0) {
      this._log('I want to consume but producer finished is true');
      return Promise.resolve(buildResult(true));
    }
    this._log('I want to consume but there is nothing to consume');
    return new Promise<IteratorResult<U>>((resolve, reject) => {
      this._waitingConsumers.push({resolve, reject});
      this._nextValues.push(value);
      this._tryToFireMoreWork();
    });
  }

  private _tryToFireMoreWork(): void {
    const resultsWaitingToBeConsumed = this._backPressure
      ? this._resultsReadyToConsume.length + this._producersInProgress
      : this._producersInProgress;
    if (resultsWaitingToBeConsumed < this._concurrency && !this._producerFinished) {
      this._log('starting work');
      this._startWork(this._nextValues.shift());
      setImmediate(() => this._tryToFireMoreWork());
    }
  }

  private _startWork(value?: any): void {
    this._producersInProgress++;
    this._ait.next(value).then((result) => {
      if (defined(result.value)) {
        return this._f(result.value).then((newValue) => buildResult(result.done, newValue));
      } else {
        return buildResult(result.done, result.value);
      }
    }).then((result: IteratorResult<U>) => {
      this._producersInProgress--;
      this._addResult(result);
      this._tryToFireMoreWork();
    }, (err: Error) => {
      this._producersInProgress--;
      this._producerError(err);
      this._tryToFireMoreWork();
    });
  }

  private _addResult(result: IteratorResult<U>): void {
    if (this._waitingConsumers.length > 0) {
      this._log('returning result to waiting consumer', result);
      const waitingConsumer = this._waitingConsumers.shift()!;
      waitingConsumer.resolve(result);
    } else if (defined(result.value)) {
      this._log('adding result to ready array', result);
      this._resultsReadyToConsume.push(result.value);
    }
    if (result.done) {
      this._producerHasFinished();
    }
  }

  private _producerError(err: Error): void {
    this._producerHasFinished();
    this._log(`Producer or mapper function failed with ${err.message}`);
  }

  private _producerHasFinished(): void {
    this._log('producer finished');
    this._producerFinished = true;
    if (this._producersInProgress === 0) {
      while (this._waitingConsumers.length > 0) {
        const waitingConsumer = this._waitingConsumers.shift()!;
        waitingConsumer.resolve(buildResult(true));
      }
    }
  }

  private _log(_message?: any, ..._optionalParams: Array<any>): void {
  }
}

function defined<T>(t: T | null | undefined): t is T {
  return t !== undefined && t !== null;
}

function buildResult<T>(done: boolean, value?: T): IteratorResult<T> {
  return {done, value: value as any as T};
}

function isAsyncIterable<T>(it: any): it is AsyncIterable<T> {
  return typeof it[Symbol.asyncIterator] === 'function';
}

function isIterable<T>(it: any): it is Iterable<T> {
  return typeof it[Symbol.iterator] === 'function';
}

function iterable2asyncIterable<T>(it: Iterable<T>): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<T> {
      const iterator = it[Symbol.iterator]();
      return {
        next: (value?: any) => {
          try {
            return Promise.resolve(iterator.next(value));
          } catch (err) {
            return Promise.reject(err);
          }
        },
        return: (value?: T) => {
          if (iterator.return) {
            try {
              return Promise.resolve(iterator.return(value));
            } catch (err) {
              return Promise.reject(err);
            }
          }
          return Promise.resolve(buildResult(true, value));
        },
        throw: (e?: Error) => {
          if (iterator.throw) {
            try {
              return Promise.resolve(iterator.throw(e));
            } catch (err) {
              return Promise.reject(err);
            }
          }
          return Promise.resolve(buildResult(true));
        }
      };
    }
  };
}
