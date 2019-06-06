An efficient promise executor'

This library allows to efficiently apply a potentially expensive function to all the elements of an iterable source.


```typescript
// To dump the results of the operation into an array, use `all`
import {all} from 'concurrent-promise-ts'

function delay(ms: number): Promise<void> { } // pauses for `ms` millis.

// An iterable source.
const source = [1, 2, 3, 4, 5, 6, ... 1000];

// An expensive function
async function expensiveFunction(n: number): Promise<number> {
  await delay(1000);
  return n;
}

// Maximum number of `expensiveFunction` that will be running at a time.
const concurrency = 32; // defaults to 32

// results is of type Array<number>
const results = await all(source, expensiveFunction, concurrency); 
```

`all` returns a promise. It will be rejected if any error occurs while retrieving data from the source, or while executing the function.

For advanced functionality, `execute` returns an asynchronous generator that traverses the source according to the `concurrency` and `backpressure` settings.

```typescript
import {execute} from 'concurrent-promise-ts'

function delay(ms: number): Promise<void> { } // pauses for `ms` millis.

// An asynchronous iterable source.
async function* source() {
  for (const number of [1, 2, 3, 4, 5, 6, ... 1000]) {
    await delay(50);
    yield number;
  }
}

// An expensive function
async function expensiveFunction(n: number): Promise<number> {
  await delay(1000);
  return n;
}

// Maximum number of `expensiveFunction` that will be running at a time.
const concurrency = 32; // defaults to 32

// If `false`, as `expensiveFunction` finishes for the first `concurrency` values of
// the source generator, the results are stored in a buffer and more values are
// requested. Repeats until the source generator finishes.
// If `true` the source generator won't be traversed if the one returned by
// `execute` isn't.
const backpressure = false; // defaults to false

// iterate
for await (const result of execute(source, expensiveFunction, concurrency, backpressure)) {
  console.log('finished for', result);
} 

```  
