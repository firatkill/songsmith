import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { expect, it } from 'vitest';
it('SEC-11 lint rejects direct and nested request bodies in logger calls', async () => {
  const eslint = new ESLint({
    overrideConfig: [tseslint.configs.disableTypeChecked],
  });
  const reports = await eslint.lintText(
    `
 declare const req: {body: unknown};
 declare const request: {body: unknown};
 declare const logger: {info(value: unknown): void; error(value: unknown): void};
 logger.info(req.body);
 logger.error({data: request.body});
 logger.info({route: '/v1/health'});
 `,
    { filePath: new URL('./log.ts', import.meta.url).pathname },
  );
  expect(
    reports
      .flatMap((report) => report.messages)
      .filter((message) => message.ruleId === 'no-restricted-syntax'),
  ).toHaveLength(2);
});
