// MIT License

// Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)

// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

export default function pLimit(concurrency: number) {
    const queue = new Array<() => Promise<any>>();
    let activeCount = 0;

    return <Res = any, Params extends any[] = any[]>(
        fn: (...args: Params) => Promise<Res>,
        ...args: Params
    ): Promise<Res> =>
        new Promise((resolve) => {
            queue.push(async () => {
                activeCount++;

                const result = fn(...args);

                resolve(result);

                try {
                    await result;
                } catch {}

                activeCount--;

                // Call next promise.
                if (queue.length > 0) {
                    const promise = queue.shift();
                    if (promise) {
                        promise();
                    }
                }
            });

            (async () => {
                // This function needs to wait until the next microtask before comparing
                // `activeCount` to `concurrency`, because `activeCount` is updated asynchronously
                // when the run function is dequeued and called. The comparison in the if-statement
                // needs to happen asynchronously as well to get an up-to-date value for `activeCount`.
                await Promise.resolve();

                if (activeCount < concurrency && queue.length > 0) {
                    const promise = queue.shift();
                    if (promise) {
                        promise();
                    }
                }
            })();
        });
}
