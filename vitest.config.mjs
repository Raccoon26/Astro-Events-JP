import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    // Each native D1 suite starts workerd. Bound concurrent runtimes so unchanged
    // 30-second bulk fixtures do not time out and continue writing into teardown.
    // All original tests, assertions, dataset sizes and deadlines remain intact.
    maxWorkers: 1,
  },
});
