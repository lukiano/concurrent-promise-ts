


function xx() {
    let arr = [];
    for (let i = 0; i < 10; i++) {
        arr.push(new Promise((resolve) => {
            const value = i;
            setTimeout(() => {
                resolve({
                    done: value >= 10,
                    value
                });
            }, 1000);
        }));
    }
    let counter = 0;
    return {
        next: () => {
            counter++;
            return arr[counter];
        }
    }
}

function xx2() {
    return {
        [Symbol.asyncIterator]: xx
    }
}

async function yy() {
    for await (const x of xx2()) {
        await new Promise((resolve) => {
            setTimeout(() => {
                resolve();
            }, 1000);
        });
        console.log(x);
    }
}

yy();
