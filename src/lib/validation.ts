import type { CheckoutForm, FormErrors } from '../types';

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
export const digits = (v: string) => v.replace(/\D/g, '');
export const isPhoneCO = (v: string) => digits(v).length === 10;

/** 0–4: longitud ≥ 8, mayúscula, número, símbolo */
export function passwordScore(pw: string) {
  return [pw.length >= 8, /[A-Z]/.test(pw), /\d/.test(pw), /[^A-Za-z0-9]/.test(pw)].filter(Boolean).length;
}

export const passwordLabels = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Excelente'];

export function validateCheckoutStep(step: number, f: CheckoutForm): FormErrors<CheckoutForm> {
  const e: FormErrors<CheckoutForm> = {};
  if (step === 1) {
    if (f.fullName.trim().length < 3) e.fullName = 'Escribe tu nombre completo';
    if (!isEmail(f.email)) e.email = 'Correo no válido';
    if (!isPhoneCO(f.phone)) e.phone = 'Celular de 10 dígitos';
    if (digits(f.docNumber).length < 6) e.docNumber = 'Número de documento no válido';
  }
  if (step === 2) {
    if (!f.department) e.department = 'Selecciona un departamento';
    if (f.city.trim().length < 3) e.city = 'Escribe la ciudad o municipio';
    if (f.address.trim().length < 6) e.address = 'Escribe la dirección completa';
  }
  if (step === 4) {
    if (f.payment === 'card') {
      if (digits(f.cardNumber).length < 15) e.cardNumber = 'Número de tarjeta incompleto';
      if (f.cardName.trim().length < 3) e.cardName = 'Nombre como aparece en la tarjeta';
      if (!/^\d{2}\s?\/\s?\d{2}$/.test(f.cardExpiry)) e.cardExpiry = 'Formato MM/AA';
      if (digits(f.cardCvc).length < 3) e.cardCvc = 'CVC no válido';
    }
    if (f.payment === 'pse' && !f.bank) e.bank = 'Selecciona tu banco';
    if (f.payment === 'wallet' && !isPhoneCO(f.walletPhone)) e.walletPhone = 'Número de 10 dígitos';
  }
  if (step === 5 && !f.acceptTerms) e.acceptTerms = 'Debes aceptar los términos para continuar';
  return e;
}

export const formatCardNumber = (v: string) => digits(v).slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
export const formatExpiry = (v: string) => {
  const d = digits(v).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
};
