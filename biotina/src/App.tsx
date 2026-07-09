/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, ChangeEvent } from "react";
import { 
  ShoppingBag, 
  Menu, 
  Search,
  Star, 
  CheckCircle2, 
  ChevronDown, 
  ChevronUp, 
  ChevronLeft,
  ChevronRight,
  Truck, 
  ShieldCheck, 
  ArrowRight,
  Droplets,
  Sparkles,
  Zap,
  Moon,
  Sun,
  Flame,
  Instagram,
  Facebook,
  Mail,
  Copy,
  Check,
  QrCode,
  MapPin,
  User,
  Phone,
  FileText,
  Clock
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { extractPixFromFruitfyPayload, pickOrderUuidForApi } from "./pixExtract";
import { parseResponseJson } from "./parseResponseJson";
import { mergeUrlParamsFromLocation, toFruitfyUtmPayload } from "./urlParams";
import {
  KIT_CATALOG,
  formatBRL,
  listPriceBRLFromKit,
} from "../../api/lib/kitPrices";

const onlyDigits = (value: string) => value.replace(/\D/g, "");
const centsFromBRL = (value: number) => Math.round(value * 100);

const formatCep = (digits: string) => {
  const d = digits.slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
};

const formatCpf = (digits: string) => {
  const d = digits.slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};

/** Valida CPF brasileiro (11 dígitos + dígitos verificadores). */
const isValidCpf = (digits: string): boolean => {
  const d = onlyDigits(digits);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]!, 10) * (10 - i);
  let rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  if (rest !== parseInt(d[9]!, 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]!, 10) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  return rest === parseInt(d[10]!, 10);
};

const formatPhoneBr = (digits: string) => {
  const d = digits.slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (rest.length === 0) return `(${ddd}) `;
  if (d.length <= 6) return `(${ddd}) ${rest}`;
  if (d.length <= 10) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
};

const BrandLogo = () => (
  <img
    src="https://i.ibb.co/ym6d1nXS/Chat-GPT-Image-26-de-jun-de-2026-12-11-58-1.png"
    alt="Body Action Biotina 100% Pura"
    className="h-7 sm:h-10 w-auto object-contain"
    referrerPolicy="no-referrer"
  />
);

const inputMaskedClass =
  "w-full px-4 py-3 rounded-xl border border-[#F5E6F0] bg-[#FAF7FB] focus:outline-none focus:border-[#C12786] focus:ring-2 focus:ring-[#C12786]/15 transition-all text-sm tabular-nums tracking-wide text-[#333333] placeholder:text-[#A6A6A6]";

const inputMaskedErrorClass =
  "w-full px-4 py-3 rounded-xl border border-red-400 bg-[#FAF7FB] focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200 transition-all text-sm tabular-nums tracking-wide text-[#333333] placeholder:text-[#A6A6A6]";

interface OrderBump {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
}

const ORDER_BUMPS: OrderBump[] = [];

// --- Checkout Components ---

const CheckoutHeader = () => (
  <header className="bg-white py-4 border-b border-[#F5E6F0] sticky top-0 z-50">
    <div className="max-w-5xl mx-auto px-4 flex items-center justify-between">
      <BrandLogo />
      <div className="flex items-center gap-2 text-[#333333] font-bold text-sm uppercase tracking-wider">
        <ShieldCheck size={18} className="text-[#C12786]" />
        Checkout Seguro
      </div>
    </div>
  </header>
);

const Checkout = ({ kit, onBack, onFinish }: { kit: any, onBack: () => void, onFinish: (data: any) => Promise<void> }) => {
  const [step, setStep] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [shipping, setShipping] = useState<'free' | 'sedex'>('free');
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);
  const [address, setAddress] = useState({
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: ''
  });
  const [customer, setCustomer] = useState({
    name: '',
    email: '',
    cpf: '',
    phone: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedOrderBumps, setSelectedOrderBumps] = useState<string[]>([]);
  const orderBumps: OrderBump[] = [
    ...ORDER_BUMPS,
    {
      id: "bump-produto-principal-extra",
      name: "1 Pote Extra com Desconto",
      description: "Mantenha sua rotina sem interrupção: leve um pote extra com desconto e continue com 2 cápsulas diárias para cabelo, pele e unhas.",
      price: 27.9,
      image: kit.image,
    },
  ];

  const handleCepChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const digits = onlyDigits(e.target.value).slice(0, 8);
    const formatted = formatCep(digits);
    setAddress((prev) => ({ ...prev, cep: formatted }));

    if (digits.length < 8) {
      setCepError(null);
      return;
    }

    setCepLoading(true);
    setCepError(null);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await response.json();
      if (data.erro) {
        setCepError("CEP não encontrado. Verifique os números.");
        setAddress((prev) => ({
          ...prev,
          cep: formatted,
          street: "",
          neighborhood: "",
          city: "",
          state: "",
        }));
      } else {
        setCepError(null);
        setAddress((prev) => ({
          ...prev,
          cep: formatted,
          street: data.logradouro ?? "",
          neighborhood: data.bairro ?? "",
          city: data.localidade ?? "",
          state: data.uf ?? "",
        }));
      }
    } catch (error) {
      console.error("Erro ao buscar CEP", error);
      setCepError("Não foi possível validar o CEP. Tente de novo.");
    } finally {
      setCepLoading(false);
    }
  };

  const cepDigits = onlyDigits(address.cep);
  const cpfDigits = onlyDigits(customer.cpf);
  const cpfInvalid = cpfDigits.length === 11 && !isValidCpf(cpfDigits);

  const subtotal = kit.price * quantity;
  const shippingPrice = shipping === 'sedex' ? 14.37 : 0;
  const orderBumpsTotal = orderBumps
    .filter((bump) => selectedOrderBumps.includes(bump.id))
    .reduce((sum, bump) => sum + bump.price, 0);
  const total = subtotal + shippingPrice + orderBumpsTotal;
  
  const toggleOrderBump = (id: string) => {
    setSelectedOrderBumps((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };
  
  const handleSubmitOrder = async () => {
    setSubmitError(null);
    const requiredFieldsFilled =
      customer.name.trim() &&
      customer.email.trim() &&
      customer.cpf.trim() &&
      customer.phone.trim();

    if (!requiredFieldsFilled) {
      setSubmitError("Preencha nome, e-mail, CPF e telefone para continuar.");
      return;
    }

    if (cpfDigits.length !== 11) {
      setSubmitError("Informe o CPF completo (11 dígitos).");
      return;
    }
    if (!isValidCpf(customer.cpf)) {
      setSubmitError("O CPF informado é inválido.");
      return;
    }

    if (cepDigits.length !== 8) {
      setSubmitError("Informe o CEP completo (8 dígitos).");
      return;
    }
    if (cepError) {
      setSubmitError("Corrija o CEP antes de finalizar o pedido.");
      return;
    }

    setSubmitting(true);
    try {
      await onFinish({ total, customer, address, shipping, quantity, orderBumpsTotal });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Não foi possível gerar o PIX.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF7FB] pb-20">
      <CheckoutHeader />
      
      <main className="max-w-5xl mx-auto px-4 py-8">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-[#5C5C5C] text-sm mb-8 hover:text-[#C12786] transition-colors"
        >
          <ChevronLeft size={16} />
          Voltar para a loja
        </button>

        <div className="grid lg:grid-cols-[1fr_380px] gap-8 items-start">
          {/* Form Section */}
          <div className="space-y-6">
            {/* Dados Pessoais */}
            <section className="bg-white p-6 sm:p-8 rounded-3xl border border-[#F5E6F0] shadow-sm space-y-6">
              <div className="flex items-center gap-3 border-b border-[#F5E6F0] pb-4">
                <div className="w-10 h-10 bg-[#F5E6F0] rounded-full flex items-center justify-center text-[#C12786]">
                  <User size={20} />
                </div>
                <h2 className="text-lg font-bold text-[#333333]">Dados Pessoais</h2>
              </div>
              
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#333333] uppercase tracking-wider">Nome Completo</label>
                  <input 
                    type="text" 
                    placeholder="Seu nome completo"
                    className="w-full px-4 py-3 rounded-xl border border-[#F5E6F0] bg-[#FAF7FB] focus:outline-none focus:border-[#C12786] transition-colors text-sm"
                    value={customer.name}
                    onChange={e => setCustomer({...customer, name: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#333333] uppercase tracking-wider">E-mail</label>
                  <input 
                    type="email" 
                    placeholder="seu@email.com"
                    className="w-full px-4 py-3 rounded-xl border border-[#F5E6F0] bg-[#FAF7FB] focus:outline-none focus:border-[#C12786] transition-colors text-sm"
                    value={customer.email}
                    onChange={e => setCustomer({...customer, email: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#333333] uppercase tracking-wider">CPF</label>
                  <input 
                    type="text" 
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="000.000.000-00"
                    maxLength={14}
                    className={cpfInvalid ? inputMaskedErrorClass : inputMaskedClass}
                    value={customer.cpf}
                    onChange={(e) =>
                      setCustomer({
                        ...customer,
                        cpf: formatCpf(onlyDigits(e.target.value)),
                      })
                    }
                  />
                  {cpfInvalid && (
                    <p className="text-xs text-red-600 font-medium">CPF inválido. Confira os números.</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#333333] uppercase tracking-wider">Celular / WhatsApp</label>
                  <input 
                    type="tel" 
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="(00) 00000-0000"
                    maxLength={15}
                    className={inputMaskedClass}
                    value={customer.phone}
                    onChange={(e) =>
                      setCustomer({
                        ...customer,
                        phone: formatPhoneBr(onlyDigits(e.target.value)),
                      })
                    }
                  />
                </div>
              </div>
            </section>

            {/* Entrega */}
            <section className="bg-white p-6 sm:p-8 rounded-3xl border border-[#F5E6F0] shadow-sm space-y-6">
              <div className="flex items-center gap-3 border-b border-[#F5E6F0] pb-4">
                <div className="w-10 h-10 bg-[#F5E6F0] rounded-full flex items-center justify-center text-[#C12786]">
                  <MapPin size={20} />
                </div>
                <h2 className="text-lg font-bold text-[#333333]">Dados de Entrega</h2>
              </div>
              
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#333333] uppercase tracking-wider">CEP</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      inputMode="numeric"
                      autoComplete="postal-code"
                      placeholder="00000-000"
                      maxLength={9}
                      className={cepError ? inputMaskedErrorClass : inputMaskedClass}
                      value={address.cep}
                      onChange={handleCepChange}
                    />
                    {cepLoading && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[#C12786] border-t-transparent rounded-full animate-spin"></div>}
                  </div>
                  {cepError && (
                    <p className="text-xs text-red-600 font-medium">{cepError}</p>
                  )}
                </div>
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-[#333333] uppercase tracking-wider">Endereço</label>
                  <input 
                    type="text" 
                    placeholder="Rua, Avenida..."
                    className="w-full px-4 py-3 rounded-xl border border-[#F5E6F0] bg-[#FAF7FB] focus:outline-none focus:border-[#C12786] transition-colors text-sm"
                    value={address.street}
                    onChange={e => setAddress({...address, street: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#333333] uppercase tracking-wider">Número</label>
                  <input 
                    type="text" 
                    placeholder="123"
                    className="w-full px-4 py-3 rounded-xl border border-[#F5E6F0] bg-[#FAF7FB] focus:outline-none focus:border-[#C12786] transition-colors text-sm"
                    value={address.number}
                    onChange={e => setAddress({...address, number: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#333333] uppercase tracking-wider">Complemento</label>
                  <input 
                    type="text" 
                    placeholder="Apto, Bloco..."
                    className="w-full px-4 py-3 rounded-xl border border-[#F5E6F0] bg-[#FAF7FB] focus:outline-none focus:border-[#C12786] transition-colors text-sm"
                    value={address.complement}
                    onChange={e => setAddress({...address, complement: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#333333] uppercase tracking-wider">Bairro</label>
                  <input 
                    type="text" 
                    placeholder="Bairro"
                    className="w-full px-4 py-3 rounded-xl border border-[#F5E6F0] bg-[#FAF7FB] focus:outline-none focus:border-[#C12786] transition-colors text-sm"
                    value={address.neighborhood}
                    onChange={e => setAddress({...address, neighborhood: e.target.value})}
                  />
                </div>
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-[#333333] uppercase tracking-wider">Cidade</label>
                  <input 
                    type="text" 
                    placeholder="Cidade"
                    className="w-full px-4 py-3 rounded-xl border border-[#F5E6F0] bg-[#FAF7FB] focus:outline-none focus:border-[#C12786] transition-colors text-sm"
                    value={address.city}
                    onChange={e => setAddress({...address, city: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#333333] uppercase tracking-wider">Estado</label>
                  <input 
                    type="text" 
                    placeholder="UF"
                    className="w-full px-4 py-3 rounded-xl border border-[#F5E6F0] bg-[#FAF7FB] focus:outline-none focus:border-[#C12786] transition-colors text-sm"
                    value={address.state}
                    onChange={e => setAddress({...address, state: e.target.value})}
                  />
                </div>
              </div>

              {cepDigits.length === 8 && !cepLoading && !cepError && (
                <div className="space-y-4 pt-4 border-t border-[#F5E6F0]">
                  <label className="text-xs font-bold text-[#333333] uppercase tracking-wider">Escolha o Frete</label>
                  <div className="grid gap-3">
                    <button 
                      onClick={() => setShipping('free')}
                      className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all text-left ${shipping === 'free' ? 'border-[#C12786] bg-[#F5E6F0]' : 'border-[#F5E6F0] hover:border-[#E0B8D8]'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${shipping === 'free' ? 'border-[#C12786]' : 'border-[#5C5C5C]'}`}>
                          {shipping === 'free' && <div className="w-2.5 h-2.5 bg-[#C12786] rounded-full" />}
                        </div>
                        <div>
                          <p className="font-bold text-[#333333] text-sm">Frete Grátis</p>
                          <p className="text-xs text-[#5C5C5C]">7 a 10 dias úteis</p>
                        </div>
                      </div>
                      <span className="font-bold text-[#C12786] text-sm">Grátis</span>
                    </button>
                    <button 
                      onClick={() => setShipping('sedex')}
                      className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all text-left ${shipping === 'sedex' ? 'border-[#C12786] bg-[#F5E6F0]' : 'border-[#F5E6F0] hover:border-[#E0B8D8]'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${shipping === 'sedex' ? 'border-[#C12786]' : 'border-[#5C5C5C]'}`}>
                          {shipping === 'sedex' && <div className="w-2.5 h-2.5 bg-[#C12786] rounded-full" />}
                        </div>
                        <div>
                          <p className="font-bold text-[#333333] text-sm">SEDEX Express</p>
                          <p className="text-xs text-[#5C5C5C]">2 a 3 dias úteis</p>
                        </div>
                      </div>
                      <span className="font-bold text-[#333333] text-sm">R$ 14,37</span>
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Pagamento */}
            <section className="bg-white p-6 sm:p-8 rounded-3xl border border-[#F5E6F0] shadow-sm space-y-6">
              <div className="flex items-center gap-3 border-b border-[#F5E6F0] pb-4">
                <div className="w-10 h-10 bg-[#F5E6F0] rounded-full flex items-center justify-center text-[#C12786]">
                  <Zap size={20} />
                </div>
                <h2 className="text-lg font-bold text-[#333333]">Pagamento</h2>
              </div>
              
              <div className="p-4 rounded-2xl border-2 border-[#C12786] bg-[#F5E6F0] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-[#C12786] shadow-sm">
                    <Zap size={20} fill="currentColor" />
                  </div>
                  <div>
                    <p className="font-bold text-[#333333] text-sm">PIX</p>
                    <p className="text-xs text-[#5C5C5C]">Aprovação imediata</p>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-[#5C5C5C] text-center italic">
                O código PIX será gerado após a finalização do pedido.
              </p>
              <div className="space-y-3">
                {orderBumps.map((bump) => {
                  const isSelected = selectedOrderBumps.includes(bump.id);
                  return (
                    <button
                      key={bump.id}
                      type="button"
                      onClick={() => toggleOrderBump(bump.id)}
                      className={`w-full text-left rounded-2xl border p-3 transition-all ${
                        isSelected
                          ? "border-[#C12786] bg-[#F5E6F0]"
                          : "border-[#F5E6F0] bg-white hover:border-[#E0B8D8]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <img
                            src={bump.image}
                            alt={bump.name}
                            className="w-14 h-14 rounded-xl object-cover border border-[#F5E6F0]"
                          />
                          <div>
                            <p className="text-sm font-bold text-[#333333]">{bump.name}</p>
                            <p className="text-xs text-[#5C5C5C] mt-1">{bump.description}</p>
                          </div>
                        </div>
                        <span className="text-sm font-black text-[#C12786] whitespace-nowrap">
                          + R$ {bump.price.toFixed(2).replace(".", ",")}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Summary Section */}
          <div className="lg:sticky lg:top-28 space-y-6">
            <section className="bg-white p-6 rounded-3xl border border-[#F5E6F0] shadow-lg space-y-6">
              <h2 className="text-lg font-bold text-[#333333] border-b border-[#F5E6F0] pb-4">Resumo do Pedido</h2>
              
              <div className="flex gap-4">
                <div className="w-20 h-20 bg-[#F5E6F0] rounded-xl overflow-hidden flex-shrink-0 border border-[#F5E6F0]">
                  <img src={kit.image} alt={kit.name} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 space-y-1">
                  <h3 className="font-bold text-[#333333] text-sm leading-tight">{kit.name} — Biotina 100% Pura</h3>
                  <p className="text-xs text-[#5C5C5C]">60 cápsulas · 2 ao dia · 1 mês</p>
                  
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center border border-[#F5E6F0] rounded-lg overflow-hidden">
                      <button 
                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                        className="px-2 py-1 hover:bg-[#F5E6F0] text-[#C12786] transition-colors"
                      >
                        <ChevronDown size={14} />
                      </button>
                      <span className="px-3 py-1 text-xs font-bold text-[#333333] border-x border-[#F5E6F0] min-w-[32px] text-center">
                        {quantity}
                      </span>
                      <button 
                        onClick={() => setQuantity(quantity + 1)}
                        className="px-2 py-1 hover:bg-[#F5E6F0] text-[#C12786] transition-colors"
                      >
                        <ChevronUp size={14} />
                      </button>
                    </div>
                    <p className="font-bold text-[#333333] text-sm">R$ {subtotal.toFixed(2).replace('.', ',')}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-[#F5E6F0]">
                <div className="flex justify-between text-sm">
                  <span className="text-[#5C5C5C]">Subtotal</span>
                  <span className="text-[#333333] font-medium">R$ {subtotal.toFixed(2).replace('.', ',')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#5C5C5C]">Frete</span>
                  <span className="text-[#C12786] font-bold">{shippingPrice > 0 ? `R$ ${shippingPrice.toFixed(2).replace('.', ',')}` : 'GRÁTIS'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#5C5C5C]">Adicionais</span>
                  <span className="text-[#333333] font-medium">R$ {orderBumpsTotal.toFixed(2).replace('.', ',')}</span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-[#F5E6F0]">
                  <span className="font-bold text-[#333333]">Total</span>
                  <div className="text-right">
                    <p className="text-2xl font-black text-[#333333]">R$ {total.toFixed(2).replace('.', ',')}</p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleSubmitOrder}
                disabled={submitting}
                className="w-full py-4 bg-[#C12786] text-white rounded-full font-bold hover:bg-[#B01E7E] transition-all shadow-lg shadow-fuchsia-100 flex items-center justify-center gap-2 group"
              >
                {submitting ? "GERANDO PIX..." : "FINALIZAR PEDIDO"}
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
              {submitError && (
                <p className="text-xs text-red-500 text-center">{submitError}</p>
              )}

              <div className="flex items-center justify-center gap-2 pt-4">
                <div className="flex items-center gap-1 text-[10px] font-bold text-[#333333]">
                  <ShieldCheck size={12} className="text-[#C12786]" />
                  COMPRA SEGURA
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
};

const POST_PIX_PAID_REDIRECT_DEFAULT = "https://rastreiogummy.netlify.app/";
const POST_PIX_POLL_MS = 200;

const PixSuccess = ({ orderData, onReset }: { orderData: any, onReset: () => void }) => {
  const [copied, setCopied] = useState(false);
  const pixCode = orderData.pixCode;
  const qrCodeImage = orderData.qrCodeImage;
  const orderUuid =
    (typeof orderData.orderId === "string" && orderData.orderId) ||
    pickOrderUuidForApi(orderData.gatewayPayload);

  useEffect(() => {
    const redirectUrl =
      (import.meta.env.VITE_PIX_PAID_REDIRECT_URL as string | undefined)?.trim() ||
      POST_PIX_PAID_REDIRECT_DEFAULT;
    if (!orderUuid) return;

    let cancelled = false;
    let inFlight = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const started = Date.now();
    const maxMs = 2 * 60 * 60 * 1000;
    const terminalFail = new Set([
      "canceled",
      "cancelled",
      "refused",
      "failed",
      "refunded",
      "chargeback",
    ]);

    const stop = () => {
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const tick = async () => {
      if (cancelled || inFlight) return;
      if (Date.now() - started > maxMs) {
        stop();
        return;
      }
      inFlight = true;
      try {
        const r = await fetch(`/api/order/${encodeURIComponent(orderUuid)}`);
        const j = (await parseResponseJson(r)) as {
          data?: { status?: string };
        };
        if (cancelled) return;
        const status = typeof j?.data?.status === "string" ? j.data.status : "";
        if (status === "paid") {
          stop();
          window.location.replace(redirectUrl);
          return;
        }
        if (terminalFail.has(status)) stop();
      } catch {
        /* próximo ciclo */
      } finally {
        inFlight = false;
      }
    };

    intervalId = setInterval(tick, POST_PIX_POLL_MS);
    void tick();

    return () => {
      cancelled = true;
      stop();
    };
  }, [orderUuid]);

  const handleCopy = () => {
    navigator.clipboard.writeText(pixCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#FAF7FB] pb-20">
      <CheckoutHeader />
      
      <main className="max-w-2xl mx-auto px-4 py-12 text-center space-y-8">
        <div className="space-y-4">
          <div className="w-20 h-20 bg-[#F5E6F0] rounded-full flex items-center justify-center text-[#C12786] mx-auto mb-6">
            <CheckCircle2 size={40} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#333333]">Pedido Realizado com Sucesso!</h1>
          <p className="text-[#5C5C5C] max-w-md mx-auto">
            Falta pouco! Finalize o pagamento via PIX e sua Biotina 100% Pura será enviada em breve.
          </p>
          {orderUuid ? (
            <p className="text-xs text-[#C12786] font-medium max-w-md mx-auto">
              Aguardando confirmação do pagamento… você será redirecionado assim que o PIX for aprovado.
            </p>
          ) : (
            <p className="text-xs text-amber-700/90 max-w-md mx-auto">
              Não foi possível identificar o pedido para acompanhamento automático. Após pagar, guarde o comprovante.
            </p>
          )}
        </div>

        <div className="bg-white p-8 rounded-3xl border border-[#F5E6F0] shadow-xl space-y-8">
          <div className="space-y-2">
            <p className="text-xs font-bold text-[#5C5C5C] uppercase tracking-widest">Valor a pagar</p>
            <p className="text-4xl font-black text-[#333333]">R$ {orderData.total.toFixed(2).replace('.', ',')}</p>
          </div>

          <div className="bg-[#F5E6F0] p-6 rounded-2xl inline-block border-2 border-[#E0B8D8]">
            {qrCodeImage ? (
              <img
                src={qrCodeImage.startsWith("data:") ? qrCodeImage : `data:image/png;base64,${qrCodeImage}`}
                alt="QR Code PIX"
                className="w-[180px] h-[180px] object-contain"
              />
            ) : (
              <QrCode size={180} className="text-[#333333]" />
            )}
          </div>

          <div className="space-y-4">
            <p className="text-sm font-bold text-[#333333]">Código PIX Copia e Cola</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input 
                type="text" 
                readOnly 
                value={pixCode}
                className="flex-1 bg-[#FAF7FB] border border-[#F5E6F0] rounded-xl px-4 py-3 text-xs text-[#5C5C5C] truncate"
              />
              <button 
                onClick={handleCopy}
                className="w-full sm:w-auto bg-[#C12786] text-white px-6 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#B01E7E] transition-all"
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 text-left max-w-md mx-auto">
          <h3 className="font-bold text-[#333333] flex items-center gap-2">
            <Clock size={18} className="text-[#C12786]" />
            Como pagar?
          </h3>
          <ol className="space-y-3 text-sm text-[#5C5C5C]">
            <li className="flex gap-3">
              <span className="w-5 h-5 bg-[#F5E6F0] rounded-full flex items-center justify-center text-[10px] font-bold text-[#C12786] flex-shrink-0">1</span>
              Abra o app do seu banco e escolha a opção PIX.
            </li>
            <li className="flex gap-3">
              <span className="w-5 h-5 bg-[#F5E6F0] rounded-full flex items-center justify-center text-[10px] font-bold text-[#C12786] flex-shrink-0">2</span>
              Escaneie o QR Code ou cole o código acima.
            </li>
            <li className="flex gap-3">
              <span className="w-5 h-5 bg-[#F5E6F0] rounded-full flex items-center justify-center text-[10px] font-bold text-[#C12786] flex-shrink-0">3</span>
              Confirme os dados e finalize o pagamento.
            </li>
          </ol>
        </div>

        <button 
          onClick={onReset}
          className="text-[#5C5C5C] text-sm font-medium hover:text-[#C12786] transition-colors pt-8"
        >
          Voltar para a página inicial
        </button>
      </main>
    </div>
  );
};


const AnnouncementBar = () => (
  <div className="bg-[#F5E6F0] text-[#C12786] text-[10px] py-2 px-4 text-center font-semibold tracking-wider uppercase border-b border-[#E0B8D8]">
    FRETE GRÁTIS PARA TODO O BRASIL · BIOTINA 100% PURA
  </div>
);

const Header = ({ cartCount }: { cartCount: number }) => {
  return (
    <header className="bg-white py-3 sm:py-4 border-b border-[#F5E6F0] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
        <button className="text-[#5C5C5C] p-1">
          <Menu size={24} sm:size={28} strokeWidth={1.5} />
        </button>
        
        <BrandLogo />

        <div className="flex items-center gap-2 sm:gap-3">
          <button className="text-[#5C5C5C] p-1">
            <Search size={20} sm:size={24} strokeWidth={1.5} />
          </button>
          <button className="relative text-[#5C5C5C] p-1">
            <ShoppingBag size={20} sm:size={24} strokeWidth={1.5} />
            {cartCount > 0 && (
              <span className="absolute top-0 right-0 bg-[#C12786] text-white text-[8px] w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full flex items-center justify-center font-bold">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};

const DarkHero = () => (
  <section className="bg-[#C12786] text-white py-12 sm:py-16 px-4 sm:px-6 text-center space-y-6 sm:space-y-8">
    <div className="flex items-center justify-center gap-4 sm:gap-8 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest opacity-80 pb-4 border-b border-white/10">
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full animate-pulse" />
        Biotina 100% Pura · Vitamina B7
      </div>
      <div className="flex items-center gap-2">
        <Sun size={12} sm:size={14} />
        45mcg por cápsula · 2 ao dia
      </div>
    </div>

    <div className="relative w-full max-w-[min(92vw,360px)] sm:max-w-md mx-auto aspect-square rounded-2xl overflow-hidden shadow-2xl">
      <img 
        src="https://i.ibb.co/qMmTSjqf/image.png" 
        alt="Biotina 100% Pura Body Action em cápsulas" 
        className="w-full h-full object-contain object-center drop-shadow-2xl"
        referrerPolicy="no-referrer"
      />
    </div>

    <h2 className="text-3xl sm:text-4xl font-bold leading-tight">
      Beleza que começa <br />
      de dentro para fora.
    </h2>

    <p className="text-sm leading-relaxed text-white/90 text-center max-w-md mx-auto px-2">
      Poucos segundos no seu dia: <strong>2 cápsulas</strong> com <strong>45mcg de biotina pura</strong> cada, sem fórmulas diluídas.
      Cada frasco traz <strong>60 cápsulas</strong> — <strong>1 mês</strong> de cuidado nutricional com a qualidade <strong>Body Action</strong>, pensado para uma rotina leve e fácil de manter.
    </p>

    <div className="pt-2 sm:pt-4">
      <button 
        onClick={() => document.getElementById('kits')?.scrollIntoView({ behavior: 'smooth' })}
        className="w-full sm:w-auto bg-white text-[#C12786] px-6 sm:px-10 py-4 sm:py-5 rounded-full font-bold text-xs sm:text-sm shadow-xl hover:bg-[#FAF7FB] active:scale-95 transition-all"
      >
        Conhecer os kits
      </button>
    </div>
  </section>
);

const LandingHero = () => (
  <section className="relative min-h-[80vh] sm:min-h-[90vh] flex items-center pt-12 sm:pt-20 pb-20 sm:pb-32 overflow-hidden bg-white">
    {/* Decorative elements */}
    <div className="absolute top-0 right-0 w-1/2 h-full bg-[#F5E6F0] -z-10 rounded-l-[100px] hidden lg:block"></div>
    <div className="absolute top-20 right-20 w-64 h-64 bg-[#C12786]/10 rounded-full blur-3xl -z-10 animate-pulse"></div>
    
    <div className="max-w-7xl mx-auto px-4 sm:px-6">
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="space-y-8 sm:space-y-12 text-center"
      >
        <div className="space-y-6 sm:space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#F5E6F0] rounded-full text-[10px] sm:text-xs font-bold text-[#C12786] uppercase tracking-widest mx-auto">
            <Sparkles size={14} /> Biotina 100% Pura Body Action
          </div>
          
          <h1 className="text-3xl sm:text-4xl lg:text-6xl font-bold text-[#333333] leading-[1.1] tracking-tight">
            Sua rotina de beleza <br />
            <span className="text-[#C12786]">começa por dentro</span> <br className="hidden sm:block" />
            do corpo.
          </h1>
        </div>

        {/* Image moved below title */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.2 }}
          className="relative max-w-xl mx-auto px-4 sm:px-0"
        >
          <img 
            src="https://i.ibb.co/sJt1Y7Wn/image.png" 
            alt="Frasco Biotina 100% Pura Body Action" 
            className="w-full h-auto object-contain max-h-[400px] sm:max-h-[500px]"
            referrerPolicy="no-referrer"
          />
        </motion.div>
        
        <div className="space-y-8 sm:space-y-10">
          <p className="text-lg sm:text-xl text-[#5C5C5C] max-w-2xl leading-relaxed mx-auto">
            Você já investiu em cremes, máscaras e tratamentos — e sabe que cuidar da beleza vai além do que aplicamos nos fios.
            A <strong>Biotina 100% Pura Body Action</strong> entrega <strong>45mcg de vitamina B7</strong> por cápsula, em <strong>2 cápsulas ao dia</strong>: nutrição concentrada para quem busca cabelos, pele e unhas com mais saúde e vitalidade.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button 
              onClick={() => {
                document.getElementById('kits')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="bg-[#C12786] text-white px-8 sm:px-10 py-5 sm:py-6 rounded-full font-bold text-base sm:text-lg shadow-2xl shadow-fuchsia-200 hover:bg-[#B01E7E] transition-all transform hover:scale-105 flex items-center justify-center gap-3 group mx-auto sm:mx-0"
            >
              QUERO CUIDAR DE MIM
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 pt-6 sm:pt-8 border-t border-[#F5E6F0] max-w-lg mx-auto">
            <div className="flex -space-x-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-white overflow-hidden bg-gray-100">
                  <img src={`https://randomuser.me/api/portraits/women/${i + 10}.jpg`} alt="User" referrerPolicy="no-referrer" />
                </div>
              ))}
            </div>
            <div className="space-y-1 text-center sm:text-left">
              <div className="flex justify-center sm:justify-start text-[#C12786]">
                {[...Array(5)].map((_, i) => <Star key={i} size={14} fill="currentColor" stroke="none" />)}
              </div>
              <p className="text-[10px] sm:text-xs text-[#5C5C5C] font-medium">+15.000 mulheres já incluíram na rotina</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  </section>
);

const Benefits = () => (
  <section id="beneficios" className="py-12 sm:py-20 bg-white">
    <div className="max-w-7xl mx-auto px-4 sm:px-6">
      <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-16 space-y-3 sm:space-y-4">
        <h2 className="text-2xl sm:text-4xl font-bold text-[#333333] tracking-tight">
          O que a Biotina faz pela sua beleza
        </h2>
        <p className="text-sm sm:text-base text-[#5C5C5C]">
          Vitamina B7 em dose concentrada para nutrir cabelos, pele e unhas de dentro para fora — com uma rotina simples que cabe no seu dia.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
        {[
          { icon: <Sparkles />, title: "Cabelos com mais força", desc: "A biotina nutre os fios por dentro, contribuindo para fios com aparência mais saudável, resistentes e com brilho natural." },
          { icon: <Droplets />, title: "Unhas mais resistentes", desc: "A vitamina B7 é essencial para unhas com estrutura mais forte — o complemento ideal para quem busca unhas bonitas e bem cuidadas." },
          { icon: <Zap />, title: "Energia no dia a dia", desc: "Participa do metabolismo de carboidratos, proteínas e gorduras, transformando os alimentos em energia para o seu corpo." },
          { icon: <CheckCircle2 />, title: "Pele com mais viço", desc: "Nutriente importante para a saúde da pele e das mucosas — o cuidado interno que complementa sua rotina de beleza." },
        ].map((benefit, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="p-6 sm:p-8 rounded-2xl border border-[#F5E6F0] hover:border-[#C12786]/20 hover:shadow-xl transition-all group"
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-[#F5E6F0] rounded-xl flex items-center justify-center text-[#C12786] mb-4 sm:mb-6 group-hover:bg-[#C12786] group-hover:text-white transition-colors">
              {benefit.icon}
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-[#333333] mb-2 sm:mb-3">{benefit.title}</h3>
            <p className="text-[#5C5C5C] leading-relaxed text-xs sm:text-sm">{benefit.desc}</p>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

const Technology = () => (
  <section id="tecnologia" className="py-12 sm:py-20 bg-[#333333] text-white overflow-hidden">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-12 sm:gap-16 items-center">
      <motion.div
        initial={{ opacity: 0, x: -50 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        className="space-y-6 sm:space-y-8 text-center lg:text-left"
      >
        <div className="space-y-3 sm:space-y-4">
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-bold leading-tight">
            Nutrição que transforma <br />
            <span className="text-[#E8A8D0]">cabelo, pele e unhas.</span>
          </h2>
          <p className="text-[#F5E6F0]/80 text-base sm:text-lg leading-relaxed max-w-xl mx-auto lg:mx-0">
            Ao ser ingerida, a biotina é absorvida e utilizada pelo organismo nas funções de metabolismo energético e na renovação de tecidos como pele, cabelos, unhas e mucosas.
            É o cuidado nutricional que complementa tudo o que você já faz por fora.
          </p>
        </div>

        <div className="grid gap-4 sm:gap-6 text-left max-w-md mx-auto lg:mx-0">
          {[
            "45mcg de biotina pura por cápsula — dose do rótulo",
            "2 cápsulas por dia, prática e fácil de manter",
            "60 cápsulas por frasco — 1 mês de rotina",
            "Body Action: marca de confiança no universo da saúde",
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3 sm:gap-4">
              <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 size={12} sm:size={14} className="text-white" />
              </div>
              <span className="text-sm sm:text-base font-medium text-[#F5E6F0]">{item}</span>
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        className="relative px-4 sm:px-0"
      >
        <div className="aspect-square rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl border border-white/10">
          <img 
            src="https://i.ibb.co/zTxkcf0g/image.png" 
            alt="Biotina 100% Pura Body Action em cápsulas" 
            className="w-full h-full object-contain"
            referrerPolicy="no-referrer"
          />
        </div>
      </motion.div>
    </div>
  </section>
);

const Ingredients = () => (
  <section id="ingredientes" className="py-12 sm:py-20 bg-[#F5E6F0]/30">
    <div className="max-w-7xl mx-auto px-4 sm:px-6">
      <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-16 space-y-3 sm:space-y-4">
        <h2 className="text-2xl sm:text-4xl font-bold text-[#333333] tracking-tight">
          Composição pensada para resultados
        </h2>
        <p className="text-sm sm:text-base text-[#5C5C5C]">
          45mcg de biotina pura por cápsula. Fórmula direta, sem excesso de ingredientes — só o que seu corpo precisa.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
        {[
          { name: "Biotina (Vitamina B7)", desc: "45mcg por cápsula — o nutriente essencial para cabelos, pele e unhas com aparência mais saudável." },
          { name: "Metabolismo equilibrado", desc: "Atua nas enzimas que metabolizam carboidratos, proteínas e gorduras, convertendo alimentos em energia." },
          { name: "Absorção diária", desc: "Vitamina hidrossolúvel que o organismo não armazena — por isso a suplementação diária faz toda a diferença." },
          { name: "60 cápsulas por frasco", desc: "Rendimento de 1 mês com 2 cápsulas por dia — praticidade para sua rotina." },
          { name: "Rotina simples", desc: "Duas cápsulas com água, preferencialmente junto às refeições. Cuidado de beleza sem complicação." },
          { name: "Body Action", desc: "Marca reconhecida no segmento esportivo e de bem-estar, com padrão de qualidade que você pode confiar." },
        ].map((item, i) => (
          <div key={i} className="bg-white p-6 sm:p-8 rounded-2xl border border-[#F5E6F0] hover:shadow-lg transition-all">
            <h4 className="text-base sm:text-lg font-bold text-[#C12786] mb-2">{item.name}</h4>
            <p className="text-xs sm:text-sm text-[#5C5C5C] leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const Kits = ({ onAddToCart }: { onAddToCart: (kit: any) => void }) => (
  <section id="kits" className="py-12 sm:py-20 bg-white">
    <div className="max-w-7xl mx-auto px-4 sm:px-6">
      <div className="text-center mb-10 sm:mb-16 space-y-3 sm:space-y-4">
        <h2 className="text-2xl sm:text-4xl font-bold text-[#333333] tracking-tight">
          Escolha o kit ideal para você
        </h2>
        <p className="text-sm sm:text-base text-[#5C5C5C]">Quanto mais tempo você mantém a rotina, mais o corpo se beneficia da nutrição diária. Escolha o kit que combina com o seu momento.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 sm:gap-12 lg:gap-8 items-center">
        {[...KIT_CATALOG].sort((a, b) => {
          const order = [1, 3, 2];
          return order.indexOf(a.id) - order.indexOf(b.id);
        }).map((kit) => {
          const list = listPriceBRLFromKit(kit.priceBRL);
          const kitBenefits: Record<number, string[]> = {
            1: [
              "Ideal para começar sua rotina de biotina",
              "60 cápsulas — 1 mês de uso",
              "2 cápsulas por dia, simples e prático",
            ],
            2: [
              "Mais constância para cabelos, pele e unhas",
              "120 cápsulas — 2 meses de cuidado diário",
              "Perfeito para acompanhar sua evolução",
            ],
            3: [
              "Rotina completa de 3 meses",
              "180 cápsulas com melhor custo-benefício",
              "O favorito de quem leva o autocuidado a sério",
            ],
          };
          const cardClass = kit.popular
            ? "border-2 border-[#C12786] rounded-3xl p-6 sm:p-8 flex flex-col items-center text-center space-y-6 shadow-2xl relative sm:transform sm:scale-105 bg-white z-10"
            : "border border-[#F5E6F0] rounded-3xl p-6 sm:p-8 flex flex-col items-center text-center space-y-6 hover:shadow-xl transition-all";
          const treatmentClass = kit.popular
            ? "text-[10px] font-bold text-[#333333] uppercase tracking-widest"
            : "text-[10px] font-bold text-[#5C5C5C] uppercase tracking-widest";

          return (
            <div key={kit.id} className={cardClass}>
              {kit.popular ? (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#C12786] text-white px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">
                  Mais Vendido
                </div>
              ) : null}
              <p className={treatmentClass}>{kit.treatmentLabel}</p>
              <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-2xl overflow-hidden">
                <img
                  src={kit.image}
                  alt={`Kit ${kit.name} Biotina 100% Pura`}
                  className="w-full h-full object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-[#333333]">{kit.name}</h3>
              <div className="space-y-1">
                <p className="text-[#5C5C5C] line-through text-xs sm:text-sm">R$ {formatBRL(list)}</p>
                <p className="text-3xl sm:text-4xl font-bold text-[#333333]">R$ {formatBRL(kit.priceBRL)}</p>
              </div>
              <ul className="w-full space-y-3 text-left">
                {kitBenefits[kit.id]?.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-2 text-xs sm:text-sm text-[#5C5C5C] leading-relaxed">
                    <CheckCircle2 size={16} className="text-[#C12786] mt-0.5 flex-shrink-0" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() =>
                  onAddToCart({
                    id: kit.id,
                    name: kit.name,
                    price: kit.priceBRL,
                    image: kit.image,
                  })
                }
                className={
                  kit.popular
                    ? "w-full py-4 bg-[#C12786] text-white rounded-full font-bold hover:bg-[#B01E7E] transition-all shadow-lg shadow-fuchsia-200 text-sm sm:text-base"
                    : "w-full py-4 bg-[#C12786] text-white rounded-full font-bold hover:bg-[#B01E7E] transition-all shadow-lg shadow-fuchsia-100 text-sm sm:text-base"
                }
              >
                {kit.popular ? "APROVEITAR OFERTA" : "COMPRAR AGORA"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  </section>
);

const FAQ = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="py-12 sm:py-20 bg-[#F5E6F0]/30">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <h2 className="text-2xl sm:text-4xl font-bold text-[#333333] text-center mb-10 sm:mb-16 tracking-tight">
          Dúvidas Frequentes
        </h2>
        
        <div className="space-y-3 sm:space-y-4">
          {[
            { q: "Em quanto tempo posso perceber resultados?", a: "Os resultados variam de pessoa para pessoa, mas com uso diário e contínuo de 2 cápsulas, muitas mulheres relatam mudanças visíveis em cabelo, unhas e pele nas primeiras semanas. A constância é o segredo." },
            { q: "Posso tomar todos os dias?", a: "Sim. A recomendação é 2 cápsulas por dia, preferencialmente junto às principais refeições. A biotina é um nutriente que o corpo precisa de forma regular." },
            { q: "Quantas cápsulas vêm no frasco?", a: "Cada frasco contém 60 cápsulas com 45mcg de biotina pura cada — rendimento de 1 mês com 2 cápsulas por dia." },
            { q: "A biotina engorda?", a: "Não. A biotina não possui calorias significativas e não está relacionada ao ganho de peso. Seu papel é nutricional — metabolismo, cabelos, pele e unhas." },
            { q: "Posso tomar junto com outras vitaminas?", a: "Em geral, sim. Caso utilize outros suplementos ou medicamentos, recomendamos consultar um profissional de saúde para orientação personalizada." },
            { q: "Como armazenar?", a: "Mantenha em local fresco e seco, protegido da luz, com a embalagem sempre fechada e fora do alcance de crianças." },
          ].map((item, i) => (
            <div key={i} className="bg-white rounded-2xl border border-[#F5E6F0] overflow-hidden">
              <button 
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full px-6 sm:px-8 py-5 sm:py-6 flex items-center justify-between text-left hover:bg-[#F5E6F0]/50 transition-colors"
              >
                <span className="font-bold text-[#333333] text-sm sm:text-base pr-4">{item.q}</span>
                <ChevronDown className={`text-[#C12786] transition-transform flex-shrink-0 ${openIndex === i ? 'rotate-180' : ''}`} size={20} />
              </button>
              <motion.div 
                initial={false}
                animate={{ height: openIndex === i ? 'auto' : 0, opacity: openIndex === i ? 1 : 0 }}
                className="overflow-hidden"
              >
                <div className="px-6 sm:px-8 pb-6 sm:pb-8 text-xs sm:text-sm text-[#5C5C5C] leading-relaxed">
                  {item.a}
                </div>
              </motion.div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const Footer = () => (
  <footer className="bg-white pt-12 sm:pt-20 pb-24 sm:pb-12 border-t border-[#F5E6F0]">
    <div className="max-w-7xl mx-auto px-4 sm:px-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 sm:gap-12 mb-12 sm:mb-16">
        <div className="space-y-4 sm:space-y-6 text-center sm:text-left">
          <div className="h-8 sm:h-10 flex justify-center sm:justify-start">
            <BrandLogo />
          </div>
          <p className="text-xs sm:text-sm text-[#5C5C5C] leading-relaxed">
            Biotina 100% pura em cápsulas práticas para sua rotina de beleza. 45mcg por cápsula, 2 ao dia, 1 mês por frasco. Body Action — cuidado que você pode confiar.
          </p>
          <div className="flex justify-center sm:justify-start gap-4">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#F5E6F0] flex items-center justify-center text-[#C12786] hover:bg-[#C12786] hover:text-white transition-all cursor-pointer">
              <Instagram size={18} sm:size={20} />
            </div>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#F5E6F0] flex items-center justify-center text-[#C12786] hover:bg-[#C12786] hover:text-white transition-all cursor-pointer">
              <Facebook size={18} sm:size={20} />
            </div>
          </div>
        </div>

        <div className="text-center sm:text-left">
          <h4 className="font-bold text-[#333333] mb-4 sm:mb-6 text-sm sm:text-base uppercase tracking-widest">Navegação</h4>
          <ul className="space-y-3 sm:space-y-4 text-xs sm:text-sm text-[#5C5C5C]">
            <li className="hover:text-[#C12786] cursor-pointer transition-colors">Início</li>
            <li className="hover:text-[#C12786] cursor-pointer transition-colors">Benefícios</li>
            <li className="hover:text-[#C12786] cursor-pointer transition-colors">Tecnologia</li>
            <li className="hover:text-[#C12786] cursor-pointer transition-colors">Kits</li>
          </ul>
        </div>

        <div className="text-center sm:text-left">
          <h4 className="font-bold text-[#333333] mb-4 sm:mb-6 text-sm sm:text-base uppercase tracking-widest">Suporte</h4>
          <ul className="space-y-3 sm:space-y-4 text-xs sm:text-sm text-[#5C5C5C]">
            <li className="hover:text-[#C12786] cursor-pointer transition-colors">Rastrear Pedido</li>
            <li className="hover:text-[#C12786] cursor-pointer transition-colors">Políticas de Envio</li>
            <li className="hover:text-[#C12786] cursor-pointer transition-colors">Trocas e Devoluções</li>
            <li className="hover:text-[#C12786] cursor-pointer transition-colors">Termos de Uso</li>
          </ul>
        </div>

        <div className="text-center sm:text-left">
          <h4 className="font-bold text-[#333333] mb-4 sm:mb-6 text-sm sm:text-base uppercase tracking-widest">Contato</h4>
          <ul className="space-y-3 sm:space-y-4 text-xs sm:text-sm text-[#5C5C5C]">
            <li className="flex items-center justify-center sm:justify-start gap-3">
              <Mail size={16} className="text-[#C12786]" />
              atendimento@bodyaction.com.br
            </li>
            <li className="flex items-center justify-center sm:justify-start gap-3">
              <ShieldCheck size={16} className="text-[#C12786]" />
              Compra 100% Segura
            </li>
          </ul>
        </div>
      </div>

      <div className="pt-8 sm:pt-12 border-t border-[#F5E6F0] flex flex-col sm:flex-row justify-between items-center gap-6 sm:gap-8">
        <p className="text-[10px] sm:text-xs text-[#5C5C5C] text-center sm:text-left">
          © 2024 Body Action. Todos os direitos reservados.
        </p>
      </div>
    </div>
  </footer>
);

// --- Main App ---

export default function App() {
  const [cartCount, setCartCount] = useState(0);
  const [view, setView] = useState<'landing' | 'checkout' | 'pix'>('landing');
  const [selectedKit, setSelectedKit] = useState<any>(null);
  const [orderData, setOrderData] = useState<any>(null);
  const [urlParams, setUrlParams] = useState<Record<string, string>>(() =>
    mergeUrlParamsFromLocation()
  );

  useEffect(() => {
    const sync = () => setUrlParams(mergeUrlParamsFromLocation());
    sync();
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, [view]);

  const handleAddToCart = (kitData: any) => {
    setSelectedKit(kitData);
    setView('checkout');
    window.scrollTo(0, 0);
  };

  const handleFinishOrder = async (data: any) => {
    const utmPayload = toFruitfyUtmPayload(urlParams);
    const response = await fetch("/api/pix/charge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.customer.name.trim(),
        email: data.customer.email.trim(),
        cpf: onlyDigits(data.customer.cpf),
        phone: onlyDigits(data.customer.phone),
        amount: centsFromBRL(data.total),
        quantity: data.quantity,
        orderBumpsValue: centsFromBRL(data.orderBumpsTotal ?? 0),
        utm: utmPayload,
      }),
    });

    const payload = (await parseResponseJson(response)) as {
      success?: boolean;
      message?: string;
    };

    if (!response.ok || payload?.success === false) {
      const message =
        payload?.message || "Não foi possível criar cobrança PIX na Fruitfy.";
      throw new Error(message);
    }

    const pixData = extractPixFromFruitfyPayload(payload);
    setOrderData({
      ...data,
      total: pixData.amount > 0 ? pixData.amount / 100 : data.total,
      pixCode: pixData.pixCode,
      qrCodeImage: pixData.qrCodeImage,
      orderId: pixData.orderId,
      gatewayPayload: pixData.raw,
    });
    setView('pix');
    window.scrollTo(0, 0);
  };

  if (view === 'checkout' && selectedKit) {
    return <Checkout kit={selectedKit} onBack={() => setView('landing')} onFinish={handleFinishOrder} />;
  }

  if (view === 'pix' && orderData) {
    return <PixSuccess orderData={orderData} onReset={() => setView('landing')} />;
  }

  return (
    <div className="min-h-screen bg-white font-sans selection:bg-[#C12786] selection:text-white">
      <AnnouncementBar />
      <Header cartCount={cartCount} />
      
      <main>
        <LandingHero />
        
        <section className="py-8 bg-white border-y border-[#F5E6F0]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-wrap justify-center items-center gap-8 sm:gap-16 opacity-40 grayscale">
            {["60 CÁPSULAS", "2 AO DIA", "100% PURA", "1 MÊS / POTE"].map((logo, i) => (
              <span key={i} className="text-[10px] sm:text-xs font-black tracking-widest uppercase text-[#333333]">{logo}</span>
            ))}
          </div>
        </section>

        <DarkHero />

        <Benefits />
        <Technology />
        
        <section className="py-12 sm:py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-12 sm:gap-16 items-center">
            <div className="order-2 lg:order-1 hidden lg:block" />
            <div className="order-1 lg:order-2 space-y-4 sm:space-y-6 text-center lg:text-left">
              <h2 className="text-2xl sm:text-4xl font-bold text-[#333333] tracking-tight">
                Beleza de dentro para fora
              </h2>
              <p className="text-sm sm:text-base text-[#5C5C5C] leading-relaxed">
                Cremes e máscaras cuidam da superfície — mas cabelos, unhas e pele também dependem de nutrição.
                A biotina (vitamina B7) é o nutriente que o corpo utiliza nesses processos, e como é hidrossolúvel, precisa ser reposta regularmente na alimentação ou suplementação.
              </p>
              <p className="text-sm sm:text-base text-[#5C5C5C] leading-relaxed">
                A <strong>Biotina 100% Pura Body Action</strong> oferece 45mcg por cápsula, em <strong>2 cápsulas ao dia</strong>: uma forma prática e concentrada de incluir esse cuidado na sua rotina,
                complementando tudo o que você já faz por fora.
              </p>
            </div>
          </div>
        </section>

        <Ingredients />
        
        <section className="py-12 sm:py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-12 sm:gap-16 items-center">
            <div className="space-y-6 sm:space-y-8 text-center lg:text-left">
              <h2 className="text-2xl sm:text-4xl font-bold text-[#333333] tracking-tight">Como incluir na sua rotina</h2>
              <div className="space-y-6 sm:space-y-8 text-left">
                {[
                  { step: "01", title: "2 cápsulas por dia", desc: "A dose recomendada para nutrir cabelos, pele e unhas de dentro para fora." },
                  { step: "02", title: "Junto às refeições", desc: "Tome com água no almoço, jantar ou conforme sua rotina — um hábito simples que cabe em qualquer agenda." },
                  { step: "03", title: "Constância é tudo", desc: "Cada frasco rende 1 mês com 2 cápsulas diárias. Manter a rotina é o que potencializa os resultados." },
                  { step: "04", title: "Com equilíbrio", desc: "Não exceda 2 cápsulas por dia. Suplementos complementam uma alimentação equilibrada — consulte um profissional se tiver dúvidas." },
                ].map((item, i) => (
                  <div key={i} className="flex gap-4 sm:gap-6">
                    <span className="text-3xl sm:text-4xl font-black text-[#D4A8CC] tabular-nums">{item.step}</span>
                    <div className="space-y-1">
                      <h4 className="font-bold text-[#333333] text-sm sm:text-base">{item.title}</h4>
                      <p className="text-xs sm:text-sm text-[#5C5C5C] leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative px-4 sm:px-0">
              <img 
                src="https://i.ibb.co/Q7txqRcp/image.png" 
                alt="Como usar Biotina 100% Pura Body Action" 
                className="rounded-2xl sm:rounded-3xl shadow-2xl w-full max-h-[560px] object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </section>

        <section className="py-12 sm:py-20 bg-[#F5E6F0]/60">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center space-y-12">
            <h2 className="text-2xl sm:text-4xl font-bold text-[#333333] tracking-tight">O que nossas clientes dizem</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                {
                  name: "Mariana S.",
                  text: "Comecei a tomar 2 cápsulas por dia e, em poucas semanas, notei meus fios mais fortes e com brilho. A biotina pura realmente faz diferença na rotina de beleza.",
                  location: "São Paulo, SP",
                  images: [
                    "https://i.ibb.co/twjWmtpt/image.png",
                    "https://i.ibb.co/HpdbXVd0/image.png",
                  ],
                },
                {
                  name: "Carla M.",
                  text: "Minhas unhas sempre lascavam com facilidade. Depois de incluir a Biotina 100% Pura no dia a dia, elas ficaram visivelmente mais resistentes. Estou muito satisfeita.",
                  location: "Rio de Janeiro, RJ",
                  images: [
                    "https://i.ibb.co/JWy8f6wh/image.png",
                    "https://i.ibb.co/tpGLN8Fy/image.png",
                  ],
                },
                {
                  name: "Fernanda R.",
                  text: "Eu sentia minha pele opaca mesmo com skincare. Com a suplementação de biotina, percebi mais viço e uma aparência mais saudável. Virou parte do meu autocuidado.",
                  location: "Belo Horizonte, MG",
                  images: [
                    "https://i.ibb.co/gZHfRFGt/image.png",
                    "https://i.ibb.co/4hQvpdK/image.png",
                  ],
                },
                {
                  name: "Juliana A.",
                  text: "O que mais gostei foi a praticidade: duas cápsulas com as refeições e pronto. Sem fórmula cheia de coisa desnecessária — só biotina pura, do jeito que eu queria.",
                  location: "Porto Alegre, RS",
                  images: [
                    "https://i.ibb.co/mrW8fVPz/image.png",
                    "https://i.ibb.co/HfsBnMxD/image.png",
                  ],
                },
                {
                  name: "Beatriz O.",
                  text: "Além do cabelo e das unhas, me sinto com mais disposição no dia a dia. A Body Action entrega o que promete: qualidade e resultado com uma rotina simples.",
                  location: "Salvador, BA",
                  images: [
                    "https://i.ibb.co/r23zthjD/image.png",
                    "https://i.ibb.co/JRXV84H4/image.png",
                  ],
                },
              ].map((review, i) => (
                <div key={i} className="bg-white p-8 rounded-2xl border border-[#F5E6F0] shadow-sm hover:shadow-md transition-shadow text-left space-y-4">
                  <div className="flex text-[#C12786]">
                    {[...Array(5)].map((_, j) => <Star key={j} size={14} fill="currentColor" stroke="none" />)}
                  </div>
                  <div className="flex gap-2">
                    {review.images.map((src, j) => (
                      <img
                        key={j}
                        src={src}
                        alt={`Foto de ${review.name}`}
                        className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg object-cover border border-[#F5E6F0] flex-shrink-0"
                        referrerPolicy="no-referrer"
                      />
                    ))}
                  </div>
                  <p className="text-[#5C5C5C] italic leading-relaxed">"{review.text}"</p>
                  <div>
                    <p className="font-bold text-[#333333]">{review.name}</p>
                    <p className="text-xs text-[#C12786]">{review.location}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Kits onAddToCart={handleAddToCart} />

        <section className="py-20 bg-[#F5E6F0]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center space-y-8">
            <div className="w-20 h-20 bg-[#C12786] text-white rounded-full flex items-center justify-center mx-auto mb-8">
              <ShieldCheck size={40} />
            </div>
            <h2 className="text-3xl font-bold text-[#333333]">Garantia de 30 dias</h2>
            <p className="text-[#5C5C5C] max-w-2xl mx-auto leading-relaxed">
              Acreditamos na qualidade da Biotina 100% Pura Body Action.
              Se em 30 dias você sentir que o produto não é para você, entre em contato com nosso suporte — estamos aqui para ajudar.
            </p>
          </div>
        </section>
        
        <FAQ />
      </main>

      <Footer />
    </div>
  );
}
