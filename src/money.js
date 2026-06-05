// money.js — minor-unit handling across currencies/rails.
// Amounts are stored as integer minor units. CRC and KES use cents (1/100);
// RWF has no subunit in practice (1). Add currencies here as rails expand.

export const MINOR = {
  // Latam + existing
  CRC: 100, BRL: 100, COP: 1, PEN: 100, ARS: 1, UYU: 1, MXN: 100,
  // Africa (existing)
  KES: 100, RWF: 1, UGX: 1, TZS: 1, ZMW: 100, XOF: 1, XAF: 1, GNF: 1, GHS: 100, EGP: 100,
  // South Asia (existing)
  INR: 100, BDT: 100, PKR: 100,
  // global batch
  THB: 100, MYR: 100, SGD: 100, IDR: 1, PHP: 100, VND: 1, KHR: 1, NPR: 100, CNY: 100,
  SAR: 100, EUR: 100, GBP: 100, USD: 100, NGN: 100, ETB: 100,
  // worldwide coverage batch
  JPY: 1, KRW: 1, AUD: 100, CAD: 100, ZAR: 100, TRY: 100, HKD: 100, KZT: 1,
  PLN: 100, SEK: 100, CHF: 100, NOK: 100, DKK: 100, HUF: 1, CZK: 100, RON: 100, UAH: 100, RUB: 100,
  AED: 100, BHD: 1000, QAR: 100, JOD: 1000, KWD: 1000, OMR: 1000, ILS: 100, LBP: 1,
  LKR: 100, MMK: 1, MNT: 1, TWD: 1,
  DOP: 100, HNL: 100, BOB: 100, PYG: 1, VES: 1, MAD: 100,
};

export const minorPer = cur => MINOR[cur] ?? 100;
export const toMinor = (major, cur) => Math.round(major * minorPer(cur));
export const toMajor = (minor, cur) => minor / minorPer(cur);
