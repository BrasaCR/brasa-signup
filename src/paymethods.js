// paymethods.js — the rail catalog. Adding a new rail is a single entry here
// plus a destination in the registry; no new code in payments/i18n/ussd.
//
// families:
//   key      account-to-account; pay to a single identifier (no dial). `conn`
//            is the connector phrase ("to key"); `field` is the structured-
//            instruction key (kept stable for verifiers).
//   merchant telco/bank mobile-money; merchant code (+optional account) and a
//            per-destination USSD dial code.
//   mpesa    M-Pesa's Paybill/Till special case.

export const RAILS = {
  // key family — Latam instant systems + UPI
  sinpe:      { family: "key", brand: "SINPE",             conn: "to",            field: "to_sinpe" },
  pix:        { family: "key", brand: "Pix",               conn: "to key",   field: "to_pix" },
  breb:       { family: "key", brand: "Bre-B",             conn: "to key",   field: "to_breb" },
  yape:       { family: "key", brand: "Yape",              conn: "to number",    field: "to_yape" },
  transfers3: { family: "key", brand: "Transferencias 3.0",conn: "to alias",     field: "to_alias" },
  toke:       { family: "key", brand: "Toke",              conn: "to code",    field: "to_toke" },
  spei:       { family: "key", brand: "SPEI",              conn: "to CLABE",   field: "to_clabe" },
  upi:        { family: "key", brand: "UPI",               conn: "to ID",        field: "to_vpa" },

  // key family — global instant / wallet systems
  promptpay:  { family: "key", brand: "PromptPay",         conn: "to ID",        field: "to_promptpay" },
  duitnow:    { family: "key", brand: "DuitNow",           conn: "to ID",        field: "to_duitnow" },
  paynow:     { family: "key", brand: "PayNow",            conn: "to",            field: "to_paynow" },
  qris:       { family: "key", brand: "QRIS",              conn: "to code",    field: "to_qris" },
  gcash:      { family: "key", brand: "GCash",             conn: "to number",    field: "to_gcash" },
  maya:       { family: "key", brand: "Maya",              conn: "to number",    field: "to_maya" },
  vietqr:     { family: "key", brand: "VietQR",            conn: "to code",    field: "to_vietqr" },
  khqr:       { family: "key", brand: "KHQR",              conn: "to code",    field: "to_khqr" },
  instapay:   { family: "key", brand: "InstaPay",          conn: "to",            field: "to_instapay" },
  stcpay:     { family: "key", brand: "STC Pay",           conn: "to number",    field: "to_stcpay" },
  sepa:       { family: "key", brand: "SEPA Instant",      conn: "to IBAN",      field: "to_iban" },
  fps:        { family: "key", brand: "Faster Payments",   conn: "to account",  field: "to_fps" },
  zelle:      { family: "key", brand: "Zelle",             conn: "to",            field: "to_zelle" },
  esewa:      { family: "key", brand: "eSewa",             conn: "to ID",        field: "to_esewa" },
  alipay:     { family: "key", brand: "Alipay",            conn: "to code",    field: "to_alipay" },
  wechat:     { family: "key", brand: "WeChat Pay",        conn: "to code",    field: "to_wechat" },

  // key family — worldwide coverage (bank instant rails + national wallets)
  paypay:      { family: "key", brand: "PayPay",              conn: "to",         field: "to_paypay" },       // Japan
  kakaopay:    { family: "key", brand: "Kakao Pay",           conn: "to",         field: "to_kakaopay" },     // South Korea
  payid:       { family: "key", brand: "PayID",               conn: "to",         field: "to_payid" },        // Australia (NPP/Osko)
  interac:     { family: "key", brand: "Interac e-Transfer",  conn: "to",         field: "to_interac" },      // Canada
  payshap:     { family: "key", brand: "PayShap",             conn: "to",         field: "to_payshap" },      // South Africa
  fast_tr:     { family: "key", brand: "FAST",                conn: "to",         field: "to_fast" },         // Türkiye
  fps_hk:      { family: "key", brand: "FPS Hong Kong",       conn: "to",         field: "to_fpshk" },        // Hong Kong
  kaspi:       { family: "key", brand: "Kaspi",               conn: "to number",  field: "to_kaspi" },        // Kazakhstan
  blik:        { family: "key", brand: "BLIK",                conn: "to code",    field: "to_blik" },         // Poland
  swish:       { family: "key", brand: "Swish",               conn: "to number",  field: "to_swish" },        // Sweden
  twint:       { family: "key", brand: "TWINT",               conn: "to number",  field: "to_twint" },        // Switzerland
  vipps:       { family: "key", brand: "Vipps",               conn: "to number",  field: "to_vipps" },        // Norway
  mobilepay:   { family: "key", brand: "MobilePay",           conn: "to number",  field: "to_mobilepay" },    // Denmark
  qvik:        { family: "key", brand: "Qvik",                conn: "to",         field: "to_qvik" },         // Hungary
  certis:      { family: "key", brand: "CERTIS Instant",      conn: "to account", field: "to_certis" },       // Czechia
  ropay:       { family: "key", brand: "RoPay",               conn: "to",         field: "to_ropay" },        // Romania
  sep:         { family: "key", brand: "SEP",                 conn: "to account", field: "to_sep" },          // Ukraine
  sbp:         { family: "key", brand: "SBP",                 conn: "to number",  field: "to_sbp" },          // Russia
  aani:        { family: "key", brand: "Aani",                conn: "to",         field: "to_aani" },         // UAE
  benefitpay:  { family: "key", brand: "BenefitPay",          conn: "to",         field: "to_benefitpay" },   // Bahrain
  fawran:      { family: "key", brand: "Fawran",              conn: "to",         field: "to_fawran" },       // Qatar
  cliq:        { family: "key", brand: "CliQ",                conn: "to",         field: "to_cliq" },         // Jordan
  wamd:        { family: "key", brand: "WAMD",                conn: "to",         field: "to_wamd" },         // Kuwait
  mpclear:     { family: "key", brand: "MpClear",             conn: "to account", field: "to_mpclear" },      // Oman
  bit:         { family: "key", brand: "Bit",                 conn: "to number",  field: "to_bit" },          // Israel
  whish:       { family: "key", brand: "Whish",               conn: "to number",  field: "to_whish" },        // Lebanon
  raast:       { family: "key", brand: "Raast",               conn: "to",         field: "to_raast" },        // Pakistan
  lankapay:    { family: "key", brand: "LankaPay",            conn: "to",         field: "to_lankapay" },     // Sri Lanka
  kbzpay:      { family: "key", brand: "KBZPay",              conn: "to",         field: "to_kbzpay" },       // Myanmar
  qpay:        { family: "key", brand: "QPay",                conn: "to code",    field: "to_qpay" },         // Mongolia
  taiwanpay:   { family: "key", brand: "Taiwan Pay",          conn: "to",         field: "to_taiwanpay" },    // Taiwan
  plin:        { family: "key", brand: "Plin",                conn: "to number",  field: "to_plin" },         // Peru
  yappy:       { family: "key", brand: "Yappy",               conn: "to",         field: "to_yappy" },        // Panama
  tpago:       { family: "key", brand: "tPago",               conn: "to",         field: "to_tpago" },        // Dominican Republic
  transfer365: { family: "key", brand: "Transfer365",         conn: "to account", field: "to_transfer365" },  // El Salvador
  achpronto:   { family: "key", brand: "ACH Pronto",          conn: "to account", field: "to_achpronto" },    // Honduras
  qrsimple:    { family: "key", brand: "QR Simple",           conn: "to code",    field: "to_qrsimple" },     // Bolivia
  spi:         { family: "key", brand: "SPI",                 conn: "to account", field: "to_spi" },          // Paraguay
  pagomovil:   { family: "key", brand: "Pago Movil",          conn: "to",         field: "to_pagomovil" },    // Venezuela
  virement:    { family: "key", brand: "Virement Instantane", conn: "to account", field: "to_virement" },     // Morocco
  fednow:      { family: "key", brand: "FedNow",              conn: "to account", field: "to_fednow" },       // United States (rail)
  pesalink:    { family: "key", brand: "PesaLink",            conn: "to",         field: "to_pesalink" },     // Kenya (bank rail)

  // M-Pesa special case (Paybill / Till)
  mpesa:      { family: "mpesa", brand: "M-PESA" },

  // merchant family — telco/bank mobile-money with per-destination dial code
  momo:       { family: "merchant", brand: "MTN MoMo" },
  airtel:     { family: "merchant", brand: "Airtel Money" },
  orange:     { family: "merchant", brand: "Orange Money" },
  tigo:       { family: "merchant", brand: "Tigo Pesa" },
  vodafone:   { family: "merchant", brand: "Vodafone Cash" },
  equitel:    { family: "merchant", brand: "Equitel" },
  tkash:      { family: "merchant", brand: "T-Kash" },
  bkash:      { family: "merchant", brand: "bKash" },
  jazzcash:   { family: "merchant", brand: "JazzCash" },

  // merchant family — more telco/wallet mobile-money worldwide
  easypaisa:  { family: "merchant", brand: "Easypaisa" },
  nagad:      { family: "merchant", brand: "Nagad" },
  telebirr:   { family: "merchant", brand: "telebirr" },
  ecocash:    { family: "merchant", brand: "EcoCash" },
  opay:       { family: "merchant", brand: "OPay" },
  palmpay:    { family: "merchant", brand: "PalmPay" },
  wave:       { family: "merchant", brand: "Wave" },
  fawry:      { family: "merchant", brand: "Fawry" },
  evcplus:    { family: "merchant", brand: "EVC Plus" },     // Somalia (Hormuud USSD mobile money)
};

export const railConfig = rail => RAILS[rail] || RAILS.sinpe;
