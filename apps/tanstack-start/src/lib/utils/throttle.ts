// https://github.com/sindresorhus/throttleit/blob/main/index.js

/**
Throttle a function to limit its execution rate.

Creates a throttled function that limits calls to the original function to at most once every `wait` milliseconds. It guarantees execution after the final invocation and maintains the last context (`this`) and arguments.

@param function_ - The function to be throttled.
@param wait - The number of milliseconds to throttle invocations to.
@returns A new throttled version of the provided function.

@example
```
import { throttle } from './throttle';

// Throttling a function that processes data.
function processData(data) {
	console.log('Processing:', data);

	// Add data processing logic here.
}

// Throttle the `processData` function to be called at most once every 3 seconds.
const throttledProcessData = throttle(processData, 3000);

// Simulate calling the function multiple times with different data.
throttledProcessData('Data 1');
throttledProcessData('Data 2');
throttledProcessData('Data 3');
```
*/
export function throttle<T extends (...arguments_: unknown[]) => unknown>(
	function_: T,
	wait: number
): T {
	if (typeof function_ !== 'function') {
		throw new TypeError(`Expected the first argument to be a \`function\`, got \`${typeof function_}\`.`);
	}

	// TODO: Add `wait` validation too in the next major version.

	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	let lastCallTime = 0;

	return function throttled(...arguments_) {
		clearTimeout(timeoutId);

		const now = Date.now();
		const timeSinceLastCall = now - lastCallTime;
		const delayForNextCall = wait - timeSinceLastCall;

		if (delayForNextCall <= 0) {
			lastCallTime = now;
			function_.apply(this, arguments_);
		} else {
			timeoutId = setTimeout(() => {
				lastCallTime = Date.now();
				function_.apply(this, arguments_);
			}, delayForNextCall);
		}
	} as T;
}
