import PQueue from "p-queue";
import { isIterable } from "./util";

export async function* enqueue<T, U>(
  source: Iterable<T> | AsyncIterable<T>,
  f: (t: T) => Promise<U | Iterable<U>> | AsyncIterable<U>,
  concurrency: number,
  backPressure: boolean,
): AsyncIterable<U> {
  const queue = new PQueue({ concurrency });
  const promises = new Array<Promise<U | Iterable<U> | undefined>>(); // holds promises returned by PQueue.
  let sourceFinished = false; // to differentiate if promises array is empty because there is no more data to read, or because the consumer is faster than the source.
  let thisFinished = false; // to stop reading data from the source if the consumer stopped traversing this generator.
  const producerLoop = async () => {
    try {
      for await (const value of source) {
        const applyF = async () => {
          const result = f(value);
          if (result instanceof Promise) {
            return result;
          }
          for await (const r of result) {
            promises.push(queue.add(() => r));
          }
          return undefined; // special case: this promise won't have any effect
        };
        const applying = queue.add(applyF);
        applying.catch(() => {}); // in case promises are left unread
        promises.push(applying);
        if (backPressure && promises.length >= concurrency) {
          // wait until the consumer read some data from this generator before continuing reading from the source.
          await new Promise((resolve) => queue.once("active", resolve));
        }
        if (thisFinished) {
          return; // stop reading from source
        }
      }
    } catch (err) {
      promises.push(Promise.reject(err)); // transfer errors from source to consumer
    } finally {
      sourceFinished = true;
      queue.emit("active");
    }
  };
  const producing = producerLoop();
  try {
    await new Promise((resolve) => queue.once("active", resolve)); // wait until producerLoop starts working.
    while (promises.length > 0) {
      const promise = promises.shift()!;
      if (promises.length < concurrency) {
        queue.emit("active"); // to trigger back pressure branch in producerLoop.
      }
      const result = await promise;
      if (result !== undefined) {
        // handle special case from producerLoop
        if (isIterable(result)) {
          yield* result;
        } else {
          yield result;
        }
      }
      if (promises.length === 0 && !sourceFinished) {
        await new Promise((resolve) => queue.once("active", resolve));
      }
    }
  } finally {
    thisFinished = true;
    queue.emit("active");
    await producing;
  }
}
