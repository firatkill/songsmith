import { URLSearchParams } from 'node:url';
import { setTimeout } from 'node:timers/promises';

export function devClientUrl(platform) {
  // SDK 58 reserved parameters are applied directly by the native dev menu.
  return `songsmith://?${new URLSearchParams({
    __expo_url:
      platform === 'ios' ? 'http://localhost:8081' : 'http://10.0.2.2:8081',
    __expo_disable_onboarding: '1',
    __expo_disable_auto_launch: '1',
    __expo_disable_fab: '1',
  })}`;
}
export function commandError(error) {
  return [error.message, error.stderr?.trim()].filter(Boolean).join('\n');
}
export async function retryQuery(query, pause = setTimeout) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await query();
    } catch (error) {
      if (attempt === 3) throw error;
      await pause(1000 * attempt);
    }
  }
}

// Scope code 2 to get_app_container: the same code elsewhere can mean a real failure.
export function classifyDeviceResult(args, output, error) {
  if (
    args[0] === 'simctl' &&
    args[1] === 'get_app_container' &&
    error &&
    (error.code === 2 ||
      /NSPOSIXErrorDomain[^\n]*code[=: ]+2\b/i.test(commandError(error)))
  )
    return 'missing';
  if (
    args.includes('pm') &&
    args.includes('path') &&
    !error &&
    !/^package:/m.test(output)
  )
    return 'missing';
  if (
    args[0] === 'simctl' &&
    args[1] === 'terminate' &&
    error &&
    /not running|found nothing to terminate/i.test(commandError(error))
  )
    return 'stopped';
  return error ? 'error' : 'ok';
}
export async function runDeviceCommand(run, args, pause) {
  return retryQuery(async () => {
    let output = '';
    let failure;
    try {
      output = await run();
    } catch (error) {
      failure = error;
    }
    const result = classifyDeviceResult(args, output, failure);
    if (result === 'error') throw failure;
    return result === 'ok' ? output : '';
  }, pause);
}
