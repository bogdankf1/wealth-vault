import {
  decAdd,
  decCmp,
  decDiv,
  decIsZero,
  decMin,
  decMul,
  decQuantize,
  decSub,
  pyDecimalString,
  pyFloatMoney,
  rawMoney,
  scaleOf,
} from './money';

describe('scaleOf', () => {
  it.each([
    ['1000.00', 2],
    ['1000', 0],
    ['0.083', 3],
    ['8.34150', 5],
  ])('%s → %i', (input, expected) => {
    expect(scaleOf(input)).toBe(expected);
  });
});

describe('decMul — Python Decimal scale semantics: scale(a)+scale(b)', () => {
  it('keeps trailing zeros the way Python does', () => {
    expect(decMul('1000.00', '1')).toBe('1000.00');
    expect(decMul('100.50', '0.083')).toBe('8.34150');
    expect(decMul('0.10', '4.33')).toBe('0.4330');
    expect(decMul('6500.00', '1')).toBe('6500.00');
    expect(decMul('500.00', '0')).toBe('0.00');
  });
});

describe('decAdd / decSub — scale is max(scale(a), scale(b))', () => {
  it('adds without normalizing', () => {
    expect(decAdd('6500.00', '1000.00')).toBe('7500.00');
    expect(decAdd('8.34150', '1.00')).toBe('9.34150');
    expect(decAdd('0', '12.34')).toBe('12.34');
  });

  it('subtracts without normalizing', () => {
    expect(decSub('1000', '250.50')).toBe('749.50');
    expect(decSub('100.00', '150.00')).toBe('-50.00');
  });
});

describe('decDiv — Python ideal-exponent semantics', () => {
  // Every expectation below was taken from CPython's decimal module, not derived.
  it('pads an exact quotient to scale(a) - scale(b)', () => {
    expect(decDiv('45000.00', '6')).toBe('7500.00');
    expect(decDiv('7500.00', '2')).toBe('3750.00');
    expect(decDiv('45000.000', '6')).toBe('7500.000');
    expect(decDiv('7500', '2')).toBe('3750');
    expect(decDiv('1.5', '0.5')).toBe('3');
  });

  it('keeps the digits an exact quotient actually needs', () => {
    expect(decDiv('100', '8')).toBe('12.5');
  });

  it('carries an inexact quotient to 28 significant digits', () => {
    expect(decDiv('10.00', '3')).toBe('3.333333333333333333333333333');
    expect(decDiv('45000.00', '7')).toBe('6428.571428571428571428571429');
  });
});

describe('decCmp / decIsZero / decMin', () => {
  it('compares numerically, not lexically', () => {
    expect(decCmp('9', '10')).toBe(-1);
    expect(decCmp('10.00', '10')).toBe(0);
    expect(decCmp('10.01', '10')).toBe(1);
  });

  it('treats any spelling of zero as zero', () => {
    expect(decIsZero('0')).toBe(true);
    expect(decIsZero('0.00')).toBe(true);
    expect(decIsZero('0.01')).toBe(false);
  });

  it('returns the smaller operand unchanged (scale preserved)', () => {
    expect(decMin('100.00', '250')).toBe('100.00');
    expect(decMin('250', '100.00')).toBe('100.00');
  });
});

describe('decQuantize — half-even, like Decimal.quantize', () => {
  it('rounds to the requested places', () => {
    expect(decQuantize('8.34150', 2)).toBe('8.34');
    expect(decQuantize('2.005', 2)).toBe('2.00');
    expect(decQuantize('2.015', 2)).toBe('2.02');
  });
});

describe('pyFloatMoney — reproduces Python str(float(Decimal))', () => {
  it.each([
    ['1000.00', '1000.0'],
    ['100.50', '100.5'],
    ['8.34150', '8.3415'],
    ['0.10', '0.1'],
    ['1234.56', '1234.56'],
    ['6500.00', '6500.0'],
    ['0.4330', '0.433'],
  ])('%s → %s', (input, expected) => {
    expect(pyFloatMoney(input)).toBe(expected);
  });
});

describe('rawMoney', () => {
  it('passes the DB string through untouched', () => {
    expect(rawMoney('1000.00')).toBe('1000.00');
  });
});

describe('pyDecimalString — Python str(Decimal) notation', () => {
  it.each([
    ['0.00', '0.00'],
    ['0', '0'],
    ['123.45', '123.45'],
    ['0.000001', '0.000001'],
    ['433.0000000000000071054273576', '433.0000000000000071054273576'],
    ['-0.00', '-0.00'],
  ])('keeps %s in plain notation', (input, expected) => {
    expect(pyDecimalString(input)).toBe(expected);
  });

  it('switches to scientific past an adjusted exponent of -6, as Python does', () => {
    // Zero with a large scale is the case that shows up live: /expenses/stats answers "0E-49"
    // for a user with no expenses.
    expect(pyDecimalString(`0.${'0'.repeat(49)}`)).toBe('0E-49');
    expect(pyDecimalString('0.0000001')).toBe('1E-7');
  });
});
