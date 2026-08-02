import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { toErrorMessage } from '../../lib/errors';
import { COLORS, RADIUS } from '../../lib/theme';
import {
  CYCLE_OPTIONS,
  addMonthsISO,
  formatCurrency,
  formatDate,
  formatDateInput,
  maskDateInput,
  parseAmountInput,
  parseDateInput,
  toMonthlyAmount,
  todayISO,
  toISODate,
} from '../../lib/format';
import { PENALTY_OPTIONS, calculateEarlyTerminationFee } from '../../lib/contract';
import {
  useServiceTemplates,
  type UseServiceTemplatesResult,
} from '../../hooks/useServiceTemplates';
import type {
  BillingCycle,
  Category,
  Currency,
  PaymentMethod,
  PenaltyType,
  ServiceTemplate,
} from '../../types';

const CURRENCIES: Currency[] = ['TRY', 'USD', 'EUR', 'GBP'];

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'credit_card', label: 'Kredi Kartı' },
  { value: 'debit_card', label: 'Banka Kartı' },
  { value: 'auto_payment', label: 'Otomatik Ödeme' },
  { value: 'bank_transfer', label: 'Havale/EFT' },
  { value: 'invoice', label: 'Fatura' },
  { value: 'other', label: 'Diğer' },
];

const COMMITMENT_PRESETS = [12, 24, 36];

// ═══════════════════════════════════════════════════════════════════════════
// Abonelik & taahhüt ekleme — Scope 4
//
// İki adım: (1) hazır şablon seç ya da elle başla, (2) formu doldur.
// Kaydetme sırası: subscriptions → contracts. REST üzerinden transaction
// olmadığı için taahhüt kaydı başarısız olursa abonelik geri alınır.
// ═══════════════════════════════════════════════════════════════════════════

export default function AddSubscriptionScreen() {
  const [step, setStep] = useState<'picker' | 'form'>('picker');
  const [template, setTemplate] = useState<ServiceTemplate | null>(null);

  // Katalog burada bir kez çekilir; iki adım da aynı veriyi kullanır.
  const catalog = useServiceTemplates();

  const handlePickTemplate = (picked: ServiceTemplate | null) => {
    setTemplate(picked);
    setStep('form');
  };

  if (step === 'picker') {
    return <TemplatePicker catalog={catalog} onPick={handlePickTemplate} />;
  }

  const reset = () => {
    setTemplate(null);
    setStep('picker');
  };

  return (
    <SubscriptionForm
      template={template}
      categories={catalog.categories}
      onBack={reset}
      // Kaydettikten sonra formu sıfırla: sekme mount'ta kaldığı için
      // aksi hâlde kullanıcı "Ekle"ye dönünce eski değerleri görür.
      onSaved={() => {
        reset();
        router.replace('/(tabs)');
      }}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Adım 1 — Şablon seçimi
// ═══════════════════════════════════════════════════════════════════════════

function TemplatePicker({
  catalog,
  onPick,
}: {
  catalog: UseServiceTemplatesResult;
  onPick: (t: ServiceTemplate | null) => void;
}) {
  const { templates, categories, categoryById, loading, error, refetch } = catalog;
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    return templates.filter((t) => {
      if (categoryId && t.category_id !== categoryId) return false;
      if (!q) return true;
      return (
        t.name.toLocaleLowerCase('tr-TR').includes(q) ||
        (t.provider_name ?? '').toLocaleLowerCase('tr-TR').includes(q)
      );
    });
  }, [templates, query, categoryId]);

  // Yalnızca şablonu olan kategorileri filtre çubuğunda göster.
  const usedCategories = useMemo(() => {
    const ids = new Set(templates.map((t) => t.category_id).filter(Boolean));
    return categories.filter((c) => ids.has(c.id));
  }, [templates, categories]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.screenTitle}>Ne eklemek istiyorsun?</Text>
        <Text style={styles.screenSubtitle}>
          Hazır bir servis seç ya da bilgileri kendin gir.
        </Text>

        <TouchableOpacity
          style={styles.manualCard}
          onPress={() => onPick(null)}
          activeOpacity={0.85}
        >
          <View style={styles.manualIcon}>
            <Text style={styles.manualIconText}>✎</Text>
          </View>
          <View style={styles.manualTextBlock}>
            <Text style={styles.manualTitle}>Elle Ekle</Text>
            <Text style={styles.manualSubtitle}>
              Listede olmayan bir abonelik ya da üyelik
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>

        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Servis ara — Netflix, Turkcell, MACFit..."
          placeholderTextColor={COLORS.dimmest}
          autoCorrect={false}
        />

        {usedCategories.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            <Chip
              label="Tümü"
              selected={categoryId === null}
              onPress={() => setCategoryId(null)}
            />
            {usedCategories.map((c) => (
              <Chip
                key={c.id}
                label={`${c.icon ?? ''} ${c.name}`.trim()}
                selected={categoryId === c.id}
                onPress={() => setCategoryId(c.id)}
              />
            ))}
          </ScrollView>
        )}

        {loading && (
          <View style={styles.centerBlock}>
            <ActivityIndicator color={COLORS.primaryLight} />
          </View>
        )}

        {error && !loading && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={refetch} style={styles.retrySmall}>
              <Text style={styles.retrySmallText}>Tekrar Dene</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !error && filtered.length === 0 && (
          <Text style={styles.noResult}>
            Eşleşen servis yok. "Elle Ekle" ile devam edebilirsin.
          </Text>
        )}

        {filtered.map((t) => {
          const category = t.category_id ? categoryById.get(t.category_id) : undefined;
          const accent = t.color ?? category?.color ?? COLORS.primary;

          return (
            <TouchableOpacity
              key={t.id}
              style={styles.templateRow}
              onPress={() => onPick(t)}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.templateIcon,
                  { backgroundColor: `${accent}33`, borderColor: `${accent}66` },
                ]}
              >
                <Text style={styles.templateIconText}>{category?.icon ?? '📦'}</Text>
              </View>

              <View style={styles.templateTextBlock}>
                <Text style={styles.templateName} numberOfLines={1}>
                  {t.name}
                </Text>
                <Text style={styles.templateMeta} numberOfLines={1}>
                  {category?.name ?? 'Kategorisiz'}
                  {t.supports_contract ? ' · Taahhütlü' : ''}
                </Text>
              </View>

              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Adım 2 — Form
// ═══════════════════════════════════════════════════════════════════════════

function SubscriptionForm({
  template,
  categories,
  onBack,
  onSaved,
}: {
  template: ServiceTemplate | null;
  categories: Category[];
  onBack: () => void;
  onSaved: () => void;
}) {
  // ── Abonelik alanları ──
  const [name, setName] = useState(template?.name ?? '');
  const [providerName, setProviderName] = useState(template?.provider_name ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(template?.category_id ?? null);
  const [price, setPrice] = useState(
    template?.default_price != null ? String(template.default_price) : '',
  );
  const [currency, setCurrency] = useState<Currency>(template?.default_currency ?? 'TRY');
  const [cycle, setCycle] = useState<BillingCycle>(template?.default_billing_cycle ?? 'monthly');
  const [interval, setIntervalValue] = useState(1);
  const [nextPaymentInput, setNextPaymentInput] = useState(
    formatDateInput(addMonthsISO(todayISO(), 1) ?? todayISO()),
  );

  // ── Gelişmiş ──
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [reminderDays, setReminderDays] = useState('3');
  const [notes, setNotes] = useState('');

  // ── Taahhüt ──
  const [hasContract, setHasContract] = useState(template?.supports_contract ?? false);
  const [contractStartInput, setContractStartInput] = useState(formatDateInput(todayISO()));
  const [commitmentMonths, setCommitmentMonths] = useState('24');
  const [penaltyType, setPenaltyType] = useState<PenaltyType>(
    template?.default_penalty_type && template.default_penalty_type !== 'none'
      ? template.default_penalty_type
      : 'remaining_discount',
  );
  const [penaltyFixed, setPenaltyFixed] = useState('');
  const [monthlyDiscount, setMonthlyDiscount] = useState('');
  const [deviceOutstanding, setDeviceOutstanding] = useState('');
  const [penaltyCap, setPenaltyCap] = useState('');
  const [autoRenew, setAutoRenew] = useState(false);
  const [postContractPrice, setPostContractPrice] = useState('');

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ── Türetilmiş önizlemeler ──
  const priceValue = parseAmountInput(price);
  const monthlyPreview =
    priceValue !== null ? toMonthlyAmount(priceValue, cycle, interval) : null;

  const contractStartISO = parseDateInput(contractStartInput);
  const monthsValue = Number.parseInt(commitmentMonths, 10);
  const contractEndISO =
    contractStartISO && Number.isFinite(monthsValue) && monthsValue > 0
      ? addMonthsISO(contractStartISO, monthsValue)
      : null;

  const penaltyPreview = useMemo(() => {
    if (!hasContract || !contractEndISO) return null;
    return calculateEarlyTerminationFee({
      penaltyType,
      endDateISO: contractEndISO,
      penaltyFixedAmount: parseAmountInput(penaltyFixed),
      monthlyDiscountAmount: parseAmountInput(monthlyDiscount),
      deviceOutstandingAmount: parseAmountInput(deviceOutstanding) ?? 0,
      penaltyCapAmount: parseAmountInput(penaltyCap),
      monthlyAmount: monthlyPreview,
    });
  }, [
    hasContract,
    contractEndISO,
    penaltyType,
    penaltyFixed,
    monthlyDiscount,
    deviceOutstanding,
    penaltyCap,
    monthlyPreview,
  ]);

  // ── Doğrulama ──
  function validate(): string | null {
    if (!name.trim()) return 'Servis adı gerekli.';
    if (priceValue === null) return 'Geçerli bir tutar gir.';

    const nextISO = parseDateInput(nextPaymentInput);
    if (!nextISO) return 'Sonraki ödeme tarihi GG.AA.YYYY biçiminde olmalı.';

    const reminder = Number.parseInt(reminderDays, 10);
    if (!Number.isFinite(reminder) || reminder < 0 || reminder > 90) {
      return 'Hatırlatma günü 0 ile 90 arasında olmalı.';
    }

    if (hasContract) {
      if (!contractStartISO) return 'Taahhüt başlangıcı GG.AA.YYYY biçiminde olmalı.';
      if (!Number.isFinite(monthsValue) || monthsValue < 1 || monthsValue > 120) {
        return 'Taahhüt süresi 1 ile 120 ay arasında olmalı.';
      }
      // DB'deki contracts_penalty_fields_present CHECK'ini önden karşıla.
      if (penaltyType === 'fixed' && parseAmountInput(penaltyFixed) === null) {
        return 'Sabit cayma bedeli için bir tutar gir.';
      }
      if (
        penaltyType === 'remaining_discount' &&
        parseAmountInput(monthlyDiscount) === null
      ) {
        return 'Kalan indirim modeli için aylık indirim tutarını gir.';
      }
    }

    return null;
  }

  // ── Kaydet ──
  async function handleSave() {
    const validationError = validate();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    setFormError(null);

    let createdSubscriptionId: string | null = null;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Oturum bulunamadı. Lütfen tekrar giriş yap.');

      const userId = session.user.id;
      const nextISO = parseDateInput(nextPaymentInput)!;
      const startISO = hasContract && contractStartISO ? contractStartISO : todayISO();

      // start_date ≤ next_payment_date — DB CHECK'i bunu şart koşuyor.
      const safeStartISO = startISO <= nextISO ? startISO : nextISO;

      const { data: subscription, error: subError } = await supabase
        .from('subscriptions')
        .insert({
          user_id: userId,
          category_id: categoryId,
          template_id: template?.id ?? null,
          name: name.trim(),
          provider_name: providerName.trim() || null,
          price: priceValue,
          currency,
          billing_cycle: cycle,
          billing_interval: interval,
          start_date: safeStartISO,
          next_payment_date: nextISO,
          status: 'active',
          source: template ? 'template' : 'manual',
          payment_method: paymentMethod,
          reminder_days_before: Number.parseInt(reminderDays, 10),
          notes: notes.trim() || null,
        })
        .select('id')
        .single();

      if (subError) throw subError;
      createdSubscriptionId = subscription.id as string;

      if (hasContract && contractStartISO && contractEndISO) {
        const { error: contractError } = await supabase.from('contracts').insert({
          user_id: userId,
          subscription_id: createdSubscriptionId,
          start_date: contractStartISO,
          end_date: contractEndISO,
          commitment_months: monthsValue,
          penalty_type: penaltyType,
          penalty_fixed_amount: parseAmountInput(penaltyFixed),
          monthly_discount_amount: parseAmountInput(monthlyDiscount),
          device_outstanding_amount: parseAmountInput(deviceOutstanding) ?? 0,
          penalty_cap_amount: parseAmountInput(penaltyCap),
          auto_renew: autoRenew,
          post_contract_price: parseAmountInput(postContractPrice),
        });

        if (contractError) throw contractError;
      }

      onSaved();
    } catch (err: unknown) {
      console.error('[AddSubscription] Kayıt hatası:', err);

      // REST üzerinde transaction yok: taahhüt eklenemediyse yarım kalmış
      // aboneliği geri al, yoksa kullanıcı taahhütsüz bir kayıtla kalır.
      if (createdSubscriptionId) {
        const { error: cleanupError } = await supabase
          .from('subscriptions')
          .delete()
          .eq('id', createdSubscriptionId);

        if (cleanupError) {
          console.error('[AddSubscription] Geri alma başarısız:', cleanupError);
          Alert.alert(
            'Yarım kayıt',
            'Taahhüt eklenemedi ve abonelik kaydı geri alınamadı. ' +
              'Ana ekrandan kontrol etmen gerekebilir.',
          );
        }
      }

      setFormError(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity onPress={onBack} style={styles.backLink} activeOpacity={0.7}>
          <Text style={styles.backLinkText}>‹ Servis seçimine dön</Text>
        </TouchableOpacity>

        <Text style={styles.screenTitle}>{template?.name ?? 'Yeni Abonelik'}</Text>

        {/* ── Temel bilgiler ── */}
        <Section title="Temel Bilgiler">
          <Field label="Servis adı" required>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Örn: Netflix"
              placeholderTextColor={COLORS.dimmest}
            />
          </Field>

          <Field label="Sağlayıcı">
            <TextInput
              style={styles.input}
              value={providerName}
              onChangeText={setProviderName}
              placeholder="Örn: Turkcell"
              placeholderTextColor={COLORS.dimmest}
            />
          </Field>

          <Field label="Kategori">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {categories.map((c) => (
                <Chip
                  key={c.id}
                  label={`${c.icon ?? ''} ${c.name}`.trim()}
                  selected={categoryId === c.id}
                  onPress={() => setCategoryId(categoryId === c.id ? null : c.id)}
                />
              ))}
            </ScrollView>
          </Field>
        </Section>

        {/* ── Ücret ── */}
        <Section title="Ücret">
          <Field label="Dönem tutarı" required>
            <TextInput
              style={styles.input}
              value={price}
              onChangeText={setPrice}
              placeholder="0,00"
              placeholderTextColor={COLORS.dimmest}
              keyboardType="decimal-pad"
            />
          </Field>

          <Field label="Para birimi">
            <View style={styles.chipRowWrap}>
              {CURRENCIES.map((c) => (
                <Chip
                  key={c}
                  label={c}
                  selected={currency === c}
                  onPress={() => setCurrency(c)}
                />
              ))}
            </View>
          </Field>

          <Field label="Fatura dönemi">
            <View style={styles.chipRowWrap}>
              {CYCLE_OPTIONS.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  selected={cycle === o.value}
                  onPress={() => setCycle(o.value)}
                />
              ))}
            </View>
          </Field>

          <Field label="Her kaç dönemde bir">
            <View style={styles.stepperRow}>
              <TouchableOpacity
                style={styles.stepperButton}
                onPress={() => setIntervalValue((v) => Math.max(1, v - 1))}
              >
                <Text style={styles.stepperText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.stepperValue}>{interval}</Text>
              <TouchableOpacity
                style={styles.stepperButton}
                onPress={() => setIntervalValue((v) => Math.min(24, v + 1))}
              >
                <Text style={styles.stepperText}>+</Text>
              </TouchableOpacity>
              <Text style={styles.stepperHint}>
                {interval === 1 ? 'her dönem' : `${interval} dönemde bir`}
              </Text>
            </View>
          </Field>

          {monthlyPreview !== null && (
            <View style={styles.previewBox}>
              <Text style={styles.previewLabel}>Aylık karşılığı</Text>
              <Text style={styles.previewValue}>
                {formatCurrency(monthlyPreview, currency)}
              </Text>
            </View>
          )}
        </Section>

        {/* ── Takvim ── */}
        <Section title="Sonraki Ödeme">
          <Field label="Tarih" required hint="GG.AA.YYYY">
            <TextInput
              style={styles.input}
              value={nextPaymentInput}
              onChangeText={(v) => setNextPaymentInput(maskDateInput(v))}
              placeholder="01.09.2026"
              placeholderTextColor={COLORS.dimmest}
              keyboardType="number-pad"
            />
          </Field>

          <View style={styles.chipRowWrap}>
            {[
              { label: 'Bugün', months: 0, days: 0 },
              { label: '1 hafta', months: 0, days: 7 },
              { label: '1 ay', months: 1, days: 0 },
              { label: '1 yıl', months: 12, days: 0 },
            ].map((preset) => (
              <Chip
                key={preset.label}
                label={preset.label}
                selected={false}
                onPress={() => {
                  const base = new Date();
                  if (preset.days) base.setDate(base.getDate() + preset.days);
                  const iso = preset.months
                    ? addMonthsISO(toISODate(base), preset.months)
                    : toISODate(base);
                  if (iso) setNextPaymentInput(formatDateInput(iso));
                }}
              />
            ))}
          </View>
        </Section>

        {/* ── Taahhüt ── */}
        <Section title="Taahhüt">
          <View style={styles.switchRow}>
            <View style={styles.switchTextBlock}>
              <Text style={styles.switchLabel}>Taahhüt var</Text>
              <Text style={styles.switchHint}>
                Operatör paketleri ve spor salonu üyelikleri gibi süreli sözleşmeler
              </Text>
            </View>
            <Switch
              value={hasContract}
              onValueChange={setHasContract}
              trackColor={{ false: COLORS.surfaceStrong, true: COLORS.primary }}
              thumbColor="#fff"
            />
          </View>

          {hasContract && (
            <>
              <Field label="Başlangıç" required hint="GG.AA.YYYY">
                <TextInput
                  style={styles.input}
                  value={contractStartInput}
                  onChangeText={(v) => setContractStartInput(maskDateInput(v))}
                  placeholder="01.09.2025"
                  placeholderTextColor={COLORS.dimmest}
                  keyboardType="number-pad"
                />
              </Field>

              <Field label="Süre (ay)" required>
                <TextInput
                  style={styles.input}
                  value={commitmentMonths}
                  onChangeText={setCommitmentMonths}
                  placeholder="24"
                  placeholderTextColor={COLORS.dimmest}
                  keyboardType="number-pad"
                />
                <View style={styles.chipRowWrap}>
                  {COMMITMENT_PRESETS.map((m) => (
                    <Chip
                      key={m}
                      label={`${m} ay`}
                      selected={commitmentMonths === String(m)}
                      onPress={() => setCommitmentMonths(String(m))}
                    />
                  ))}
                </View>
              </Field>

              {contractEndISO && (
                <View style={styles.previewBox}>
                  <Text style={styles.previewLabel}>Taahhüt bitişi</Text>
                  <Text style={styles.previewValue}>{formatDate(contractEndISO, true)}</Text>
                </View>
              )}

              <Field label="Cayma bedeli modeli">
                <View style={styles.chipRowWrap}>
                  {PENALTY_OPTIONS.map((o) => (
                    <Chip
                      key={o.value}
                      label={o.label}
                      selected={penaltyType === o.value}
                      onPress={() => setPenaltyType(o.value)}
                    />
                  ))}
                </View>
                <Text style={styles.fieldHint}>
                  {PENALTY_OPTIONS.find((o) => o.value === penaltyType)?.description}
                </Text>
              </Field>

              {penaltyType === 'fixed' && (
                <Field label="Sabit cayma tutarı" required>
                  <TextInput
                    style={styles.input}
                    value={penaltyFixed}
                    onChangeText={setPenaltyFixed}
                    placeholder="0,00"
                    placeholderTextColor={COLORS.dimmest}
                    keyboardType="decimal-pad"
                  />
                </Field>
              )}

              {penaltyType === 'remaining_discount' && (
                <Field
                  label="Aylık indirim tutarı"
                  required
                  hint="Taahhüt karşılığı her ay aldığın indirim"
                >
                  <TextInput
                    style={styles.input}
                    value={monthlyDiscount}
                    onChangeText={setMonthlyDiscount}
                    placeholder="0,00"
                    placeholderTextColor={COLORS.dimmest}
                    keyboardType="decimal-pad"
                  />
                </Field>
              )}

              {penaltyType !== 'none' && (
                <>
                  <Field label="Cihaz kalan bakiyesi" hint="Yoksa boş bırak">
                    <TextInput
                      style={styles.input}
                      value={deviceOutstanding}
                      onChangeText={setDeviceOutstanding}
                      placeholder="0,00"
                      placeholderTextColor={COLORS.dimmest}
                      keyboardType="decimal-pad"
                    />
                  </Field>

                  <Field label="Cayma bedeli üst sınırı" hint="Sözleşmede tavan varsa">
                    <TextInput
                      style={styles.input}
                      value={penaltyCap}
                      onChangeText={setPenaltyCap}
                      placeholder="Sınır yok"
                      placeholderTextColor={COLORS.dimmest}
                      keyboardType="decimal-pad"
                    />
                  </Field>
                </>
              )}

              {penaltyPreview && penaltyType !== 'none' && (
                <View style={[styles.previewBox, styles.penaltyPreview]}>
                  <Text style={styles.previewLabel}>
                    Bugün çıkarsan ({penaltyPreview.monthsLeft} ay kalan)
                  </Text>
                  <Text style={[styles.previewValue, { color: COLORS.warn }]}>
                    {formatCurrency(penaltyPreview.fee, currency)}
                    {penaltyPreview.capped ? ' (tavan)' : ''}
                  </Text>
                </View>
              )}

              <Field label="Taahhüt sonrası fiyat" hint="Bitince geçilecek tutar">
                <TextInput
                  style={styles.input}
                  value={postContractPrice}
                  onChangeText={setPostContractPrice}
                  placeholder="Bilinmiyor"
                  placeholderTextColor={COLORS.dimmest}
                  keyboardType="decimal-pad"
                />
              </Field>

              <View style={styles.switchRow}>
                <View style={styles.switchTextBlock}>
                  <Text style={styles.switchLabel}>Otomatik yenilensin</Text>
                  <Text style={styles.switchHint}>Süre bitince sözleşme kendini yeniler</Text>
                </View>
                <Switch
                  value={autoRenew}
                  onValueChange={setAutoRenew}
                  trackColor={{ false: COLORS.surfaceStrong, true: COLORS.primary }}
                  thumbColor="#fff"
                />
              </View>
            </>
          )}
        </Section>

        {/* ── Gelişmiş ── */}
        <TouchableOpacity
          style={styles.advancedToggle}
          onPress={() => setShowAdvanced((v) => !v)}
          activeOpacity={0.7}
        >
          <Text style={styles.advancedToggleText}>
            {showAdvanced ? '− Gelişmiş ayarları gizle' : '+ Gelişmiş ayarlar'}
          </Text>
        </TouchableOpacity>

        {showAdvanced && (
          <Section title="Gelişmiş">
            <Field label="Ödeme yöntemi">
              <View style={styles.chipRowWrap}>
                {PAYMENT_METHODS.map((m) => (
                  <Chip
                    key={m.value}
                    label={m.label}
                    selected={paymentMethod === m.value}
                    onPress={() =>
                      setPaymentMethod(paymentMethod === m.value ? null : m.value)
                    }
                  />
                ))}
              </View>
            </Field>

            <Field label="Kaç gün önce hatırlat" hint="0–90">
              <TextInput
                style={styles.input}
                value={reminderDays}
                onChangeText={setReminderDays}
                placeholder="3"
                placeholderTextColor={COLORS.dimmest}
                keyboardType="number-pad"
              />
            </Field>

            <Field label="Not">
              <TextInput
                style={[styles.input, styles.textArea]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Sözleşme no, müşteri hizmetleri numarası..."
                placeholderTextColor={COLORS.dimmest}
                multiline
              />
            </Field>
          </Section>
        )}

        {formError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{formError}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Kaydet</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Küçük bileşenler
// ═══════════════════════════════════════════════════════════════════════════

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {required && <Text style={styles.requiredMark}> *</Text>}
        {hint ? <Text style={styles.fieldLabelHint}>{`  ${hint}`}</Text> : null}
      </Text>
      {children}
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Stiller
// ═══════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scrollContent: { padding: 20, paddingBottom: 60 },

  screenTitle: { fontSize: 26, fontWeight: '800', color: COLORS.text, letterSpacing: -0.6 },
  screenSubtitle: { fontSize: 14.5, color: COLORS.dim, marginTop: 6, marginBottom: 22 },

  backLink: { marginBottom: 12 },
  backLinkText: { fontSize: 14.5, color: COLORS.primaryLight, fontWeight: '600' },

  // ── Elle ekle kartı ──
  manualCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.4)',
    borderRadius: RADIUS.lg,
    padding: 16,
    marginBottom: 20,
  },
  manualIcon: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(124,58,237,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualIconText: { fontSize: 20, color: COLORS.primaryLight },
  manualTextBlock: { flex: 1, gap: 3 },
  manualTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  manualSubtitle: { fontSize: 13, color: COLORS.muted },

  // ── Arama & liste ──
  searchInput: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    color: COLORS.text,
    marginBottom: 14,
  },
  chipRow: { gap: 8, paddingRight: 8, paddingBottom: 4 },
  chipRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },

  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: 12,
    marginTop: 8,
  },
  templateIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateIconText: { fontSize: 18 },
  templateTextBlock: { flex: 1, gap: 2 },
  templateName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  templateMeta: { fontSize: 12.5, color: COLORS.dim },
  chevron: { fontSize: 24, color: COLORS.dimmest, marginRight: 4 },

  noResult: { color: COLORS.dim, fontSize: 14, textAlign: 'center', marginTop: 28 },
  centerBlock: { paddingVertical: 32, alignItems: 'center' },

  // ── Form ──
  section: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: 18,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primaryLight,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 13.5, color: COLORS.muted, marginBottom: 7, fontWeight: '500' },
  fieldLabelHint: { fontSize: 12, color: COLORS.dimmest, fontWeight: '400' },
  fieldHint: { fontSize: 12, color: COLORS.dim, marginTop: 7, lineHeight: 17 },
  requiredMark: { color: COLORS.danger },

  input: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.text,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },

  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceStrong,
  },
  chipSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, color: COLORS.muted, fontWeight: '500' },
  chipTextSelected: { color: '#fff', fontWeight: '700' },

  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperButton: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperText: { fontSize: 18, color: COLORS.primaryLight, fontWeight: '700' },
  stepperValue: { fontSize: 16, fontWeight: '700', color: COLORS.text, minWidth: 24, textAlign: 'center' },
  stepperHint: { fontSize: 12.5, color: COLORS.dim },

  previewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(124,58,237,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.3)',
    borderRadius: RADIUS.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 4,
  },
  penaltyPreview: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderColor: 'rgba(245,158,11,0.35)',
    marginBottom: 16,
  },
  previewLabel: { fontSize: 13, color: COLORS.muted, flex: 1 },
  previewValue: { fontSize: 16, fontWeight: '800', color: COLORS.primaryLight },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  switchTextBlock: { flex: 1, gap: 3 },
  switchLabel: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  switchHint: { fontSize: 12.5, color: COLORS.dim, lineHeight: 17 },

  advancedToggle: { paddingVertical: 16, alignItems: 'center' },
  advancedToggleText: { fontSize: 14, color: COLORS.primaryLight, fontWeight: '600' },

  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    borderRadius: RADIUS.md,
    padding: 14,
    marginTop: 16,
    gap: 10,
  },
  errorText: { color: COLORS.danger, fontSize: 13.5, lineHeight: 20 },
  retrySmall: { alignSelf: 'flex-start' },
  retrySmallText: { color: COLORS.primaryLight, fontWeight: '700', fontSize: 13.5 },

  saveButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 24,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
