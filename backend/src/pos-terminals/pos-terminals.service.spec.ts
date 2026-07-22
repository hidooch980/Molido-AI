import { PosTerminalsService } from './pos-terminals.service';

describe('PosTerminalsService', () => {
  const service = new PosTerminalsService({} as never);

  it('returns the list of Iranian banks and PSP providers', () => {
    const result = service.banks();

    expect(Array.isArray(result.banks)).toBe(true);
    expect(Array.isArray(result.psps)).toBe(true);
    expect(result.banks.length).toBeGreaterThanOrEqual(20);
    expect(result.psps.length).toBeGreaterThanOrEqual(10);
  });

  it('includes major banks', () => {
    const result = service.banks();

    expect(result.banks).toEqual(
      expect.arrayContaining(['بانک ملی ایران', 'بانک ملت', 'بانک صادرات ایران']),
    );
  });
});
