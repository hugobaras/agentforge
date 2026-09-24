import { runWithExponentialBackoff } from './retry';

describe('runWithExponentialBackoff', () => {
  it('retourne le résultat dès le premier succès', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const sleepFn = jest.fn().mockResolvedValue(undefined);

    await expect(
      runWithExponentialBackoff(fn, {
        maxAttempts: 3,
        baseDelayMs: 10,
        sleepFn,
      }),
    ).resolves.toBe('ok');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleepFn).not.toHaveBeenCalled();
  });

  it('réessaie avec un backoff exponentiel puis réussit', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('1'))
      .mockRejectedValueOnce(new Error('2'))
      .mockResolvedValue('ok');
    const sleepFn = jest.fn().mockResolvedValue(undefined);

    await expect(
      runWithExponentialBackoff(fn, {
        maxAttempts: 3,
        baseDelayMs: 10,
        sleepFn,
      }),
    ).resolves.toBe('ok');

    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleepFn).toHaveBeenNthCalledWith(1, 10);
    expect(sleepFn).toHaveBeenNthCalledWith(2, 20);
  });

  it('relance l’erreur après le nombre max de tentatives', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('boom'));
    const sleepFn = jest.fn().mockResolvedValue(undefined);

    await expect(
      runWithExponentialBackoff(fn, {
        maxAttempts: 3,
        baseDelayMs: 5,
        sleepFn,
      }),
    ).rejects.toThrow('boom');

    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleepFn).toHaveBeenCalledTimes(2);
  });
});
