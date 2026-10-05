/** Thai PromptPay (EMVCo) QR payload for a phone number or 13-digit tax/citizen ID. */
const f = (tag: string, v: string) => tag + String(v.length).padStart(2, "0") + v;

function crc16(s: string) {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let k = 0; k < 8; k++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function promptpayPayload(id: string, amount?: number) {
  const digits = id.replace(/\D/g, "");
  const account = digits.length >= 13 ? f("02", digits) : f("01", ("0000000000000" + digits.replace(/^0/, "66")).slice(-13));
  const merchant = f("00", "A000000677010111") + account;
  const body =
    f("00", "01") + f("01", amount ? "12" : "11") + f("29", merchant) + f("53", "764") + (amount ? f("54", amount.toFixed(2)) : "") + f("58", "TH") + "6304";
  return body + crc16(body);
}
