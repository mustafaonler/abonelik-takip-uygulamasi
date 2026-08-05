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
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { toErrorMessage } from '../lib/errors';
import { COLORS, RADIUS } from '../lib/theme';
import { Badge, BadgeRow, Chip, Field, Section } from '../components/ui';
import { ConfirmDialog } from '../components/ConfirmDialog';
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
} from '../lib/format';
import { PENALTY_OPTIONS, calculateEarlyTerminationFee } from '../lib/contract';
import { useServiceTemplates } from '../hooks/useServiceTemplates';
import { useSubscriptionRecord, type SubscriptionRecord } from '../hooks/useSubscriptionRecord';
import { useSubscriptionMutations } from '../hooks/useSubscriptionMutations';
import { useUserSettings } from '../hooks/useUserSettings';
import {
  cancelSubscriptionReminders,
  scheduleSubscriptionReminder,
} from '../utils/notifications';
import type {
  BillingCycle,
  Category,
  Currency,
  PaymentMethod,
  PenaltyType,
  ServiceTemplate,
} from '../types';

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

/** Sayısal DB alanını form input'una çevirir. null/undefined ⇒ boş alan. */
function amountToInput(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  return String(value);
}

// ═══════════════════════════════════════════════════════════════════════════
// Abonelik formu — ekleme ve düzenleme aynı ekran
//
// Route parametreleri:
//   (yok)                  → boş form, elle giriş
//   ?templateId=<uuid>     → hazır şablondan ön-doldurma
//   ?subscriptionId=<uuid> → düzenleme; abonelik + taahhüt yüklenir
//
// Ekleme ve düzenlemeyi tek ekranda tutmanın sebebi: alan listesi, doğrulama
// kuralları ve cayma bedeli önizlemesi ikisinde de birebir aynı. İki ayrı ekran
// olsaydı her kural iki yerde yaşardı ve zamanla birbirinden ayrışırdı.
// ═══════════════════════════════════════════════════════════════════════════

export default function SubscriptionFormScreen() {
  const { templateId, subscriptionId } = useLocalSearchParams<{
    templateId?: string;
    subscriptionId?: string;
  }>();

  const isEdit = Boolean(subscriptionId);

  const catalog = useServiceTemplates();
  const record = useSubscriptionRecord(subscriptionId ?? null);

  const template = templateId
    ? (catalog.templates.find((t) => t.id === templateId) ?? null)
    : null;

  // Hesap geneli hatırlatma varsayılanı — yeni abonelik formunu ön-doldurur.
  // Düzenlemede aboneliğin kendi değeri kullanılır, bu değere bakılmaz.
  const settings = useUserSettings();

  const loading = catalog.loading || record.loading || settings.loading;
  const error = catalog.error ?? record.error;

  const screenTitle = isEdit ? 'Aboneliği Düzenle' : 'Yeni Abonelik';

  if (loading) {
    return (
      <View style={[styles.container, styles.centerBlock]}>
        <Stack.Screen options={{ headerShown: true, title: screenTitle }} />
        <StatusBar style="light" />
        <ActivityIndicator color={COLORS.primaryLight} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centerBlock]}>
        <Stack.Screen options={{ headerShown: true, title: screenTitle }} />
        <StatusBar style="light" />
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            onPress={() => {
              void catalog.refetch();
              void record.refetch();
            }}
            style={styles.retrySmall}
          >
            <Text style={styles.retrySmallText}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Düzenlemeye gelindi ama kayıt yok: silinmiş olabilir ya da RLS gizliyordur.
  if (isEdit && record.notFound) {
    return (
      <View style={[styles.container, styles.centerBlock]}>
        <Stack.Screen options={{ headerShown: true, title: screenTitle }} />
        <StatusBar style="light" />
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            Bu abonelik bulunamadı. Başka bir cihazdan silinmiş olabilir.
          </Text>
          <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={styles.retrySmall}>
            <Text style={styles.retrySmallText}>Ana sayfaya dön</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Şablon seçilmiş ama katalogda yok: sessizce boş forma düşmek, kullanıcının
  // seçtiği servisi kaybettiğini gizlerdi.
  if (templateId && !template) {
    return (
      <View style={[styles.container, styles.centerBlock]}>
        <Stack.Screen options={{ headerShown: true, title: screenTitle }} />
        <StatusBar style="light" />
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            Seçtiğin servis katalogda bulunamadı. Listeye dönüp tekrar dene ya da
            bilgileri elle gir.
          </Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.retrySmall}>
            <Text style={styles.retrySmallText}>Servis seçimine dön</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: screenTitle }} />
      <SubscriptionForm
        template={template}
        record={record.record}
        categories={catalog.categories}
        defaultReminderDays={settings.reminderDays}
        onDone={() => router.replace('/(tabs)')}
      />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Form
// ═══════════════════════════════════════════════════════════════════════════

function SubscriptionForm({
  template,
  record,
  categories,
  defaultReminderDays,
  onDone,
}: {
  template: ServiceTemplate | null;
  record: SubscriptionRecord | null;
  categories: Category[];
  /** Ayarlar'daki hesap varsayılanı — yalnızca yeni kayıtta kullanılır. */
  defaultReminderDays: number;
  onDone: () => void;
}) {
  const existing = record?.subscription ?? null;
  const existingContract = record?.contract ?? null;
  const isEdit = existing !== null;

  const { saving, deleting, addSubscription, updateSubscription, deleteSubscription } =
    useSubscriptionMutations();

  // ── Abonelik alanları ──
  const [name, setName] = useState(existing?.name ?? template?.name ?? '');
  const [providerName, setProviderName] = useState(
    existing?.provider_name ?? template?.provider_name ?? '',
  );
  const [categoryId, setCategoryId] = useState<string | null>(
    existing?.category_id ?? template?.category_id ?? null,
  );
  const [price, setPrice] = useState(
    amountToInput(existing?.price ?? template?.default_price),
  );
  const [currency, setCurrency] = useState<Currency>(
    existing?.currency ?? template?.default_currency ?? 'TRY',
  );
  const [cycle, setCycle] = useState<BillingCycle>(
    existing?.billing_cycle ?? template?.default_billing_cycle ?? 'monthly',
  );
  const [interval, setIntervalValue] = useState(existing?.billing_interval ?? 1);
  const [startInput, setStartInput] = useState(
    formatDateInput(existing?.start_date ?? todayISO()),
  );
  const [nextPaymentInput, setNextPaymentInput] = useState(
    formatDateInput(
      existing?.next_payment_date ?? addMonthsISO(todayISO(), 1) ?? todayISO(),
    ),
  );

  // ── Gelişmiş ──
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(
    existing?.payment_method ?? null,
  );
  const [reminderDays, setReminderDays] = useState(
    String(existing?.reminder_days_before ?? defaultReminderDays),
  );
  const [notes, setNotes] = useState(existing?.notes ?? '');

  // ── Taahhüt ──
  const [hasContract, setHasContract] = useState(
    existingContract !== null || (!isEdit && (template?.supports_contract ?? false)),
  );
  const [contractStartInput, setContractStartInput] = useState(
    formatDateInput(existingContract?.start_date ?? existing?.start_date ?? todayISO()),
  );
  const [commitmentMonths, setCommitmentMonths] = useState(
    String(existingContract?.commitment_months ?? 24),
  );
  const [penaltyType, setPenaltyType] = useState<PenaltyType>(
    existingContract?.penalty_type ??
      (template?.default_penalty_type && template.default_penalty_type !== 'none'
        ? template.default_penalty_type
        : 'remaining_discount'),
  );
  const [penaltyFixed, setPenaltyFixed] = useState(
    amountToInput(existingContract?.penalty_fixed_amount),
  );
  const [monthlyDiscount, setMonthlyDiscount] = useState(
    amountToInput(existingContract?.monthly_discount_amount),
  );
  const [deviceOutstanding, setDeviceOutstanding] = useState(
    amountToInput(existingContract?.device_outstanding_amount),
  );
  const [penaltyCap, setPenaltyCap] = useState(
    amountToInput(existingContract?.penalty_cap_amount),
  );
  const [autoRenew, setAutoRenew] = useState(existingContract?.auto_renew ?? false);
  const [postContractPrice, setPostContractPrice] = useState(
    amountToInput(existingContract?.post_contract_price),
  );

  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

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

    const startISO = parseDateInput(startInput);
    if (!startISO) return 'Başlangıç tarihi GG.AA.YYYY biçiminde olmalı.';

    const nextISO = parseDateInput(nextPaymentInput);
    if (!nextISO) return 'Sonraki ödeme tarihi GG.AA.YYYY biçiminde olmalı.';

    // DB'deki subscriptions_next_payment_after_start CHECK'ini önden karşıla.
    if (nextISO < startISO) {
      return 'Sonraki ödeme tarihi, başlangıç tarihinden önce olamaz.';
    }

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
    setFormError(null);

    const startISO = parseDateInput(startInput)!;
    const nextISO = parseDateInput(nextPaymentInput)!;

    const payload = {
      subscription: {
        category_id: categoryId,
        template_id: existing?.template_id ?? template?.id ?? null,
        name: name.trim(),
        provider_name: providerName.trim() || null,
        description: existing?.description ?? null,
        logo_url: existing?.logo_url ?? template?.logo_url ?? null,
        color: existing?.color ?? template?.color ?? null,
        price: priceValue!,
        currency,
        billing_cycle: cycle,
        billing_interval: interval,
        start_date: startISO,
        next_payment_date: nextISO,
        last_payment_date: existing?.last_payment_date ?? null,
        trial_end_date: existing?.trial_end_date ?? null,
        cancelled_at: existing?.cancelled_at ?? null,
        status: existing?.status ?? ('active' as const),
        source: existing?.source ?? (template ? 'template' : 'manual'),
        payment_method: paymentMethod,
        reminder_days_before: Number.parseInt(reminderDays, 10),
        notes: notes.trim() || null,
      },
      contract:
        hasContract && contractStartISO && contractEndISO
          ? {
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
              contract_number: existingContract?.contract_number ?? null,
              notes: existingContract?.notes ?? null,
            }
          : null,
    };

    try {
      const savedId =
        isEdit && existing
          ? (await updateSubscription(existing.id, payload), existing.id)
          : await addSubscription(payload);

      // Hatırlatıcı kurulumu kaydın BAŞARISINI etkilemez: izin reddedilmiş
      // olabilir ya da platform desteklemiyor olabilir (web). Abonelik yazıldı,
      // kullanıcıyı hata ekranında tutmanın anlamı yok — sadece logluyoruz.
      try {
        await scheduleSubscriptionReminder(
          {
            id: savedId,
            name: payload.subscription.name,
            price: payload.subscription.price,
            currency: payload.subscription.currency,
            next_payment_date: payload.subscription.next_payment_date,
            contract_end_date: payload.contract?.end_date ?? null,
          },
          payload.subscription.reminder_days_before,
        );
      } catch (notifyErr: unknown) {
        console.error('[form] Hatırlatıcı kurulamadı:', notifyErr);
      }

      onDone();
    } catch (err: unknown) {
      setFormError(toErrorMessage(err));
    }
  }

  // ── Sil ──
  async function handleDelete() {
    if (!existing) return;
    try {
      await deleteSubscription(existing.id);
      // Kayıt gitti; kurulu bildirimler kalırsa kullanıcı olmayan bir
      // aboneliğin ödeme uyarısını alır.
      await cancelSubscriptionReminders(existing.id);
      setConfirmDelete(false);
      onDone();
    } catch (err: unknown) {
      setConfirmDelete(false);
      setFormError(toErrorMessage(err));
    }
  }

  const busy = saving || deleting;

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
        <Text style={styles.screenTitle}>
          {isEdit ? existing.name : (template?.name ?? 'Yeni Abonelik')}
        </Text>
        <BadgeRow>
          {isEdit ? (
            <Badge label="Düzenleniyor" tone="info" icon="✎" />
          ) : (
            <Badge
              label={template ? 'Şablondan' : 'Elle giriş'}
              tone={template ? 'info' : 'neutral'}
              icon={template ? '★' : '✎'}
            />
          )}
          {!isEdit && template?.supports_contract ? (
            <Badge label="Taahhütlü olabilir" tone="warn" icon="!" />
          ) : null}
        </BadgeRow>

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
        <Section title="Takvim">
          <Field label="Başlangıç tarihi" required hint="GG.AA.YYYY">
            <TextInput
              style={styles.input}
              value={startInput}
              onChangeText={(v) => setStartInput(maskDateInput(v))}
              placeholder="01.09.2025"
              placeholderTextColor={COLORS.dimmest}
              keyboardType="number-pad"
            />
          </Field>

          <Field label="Sonraki ödeme" required hint="GG.AA.YYYY">
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

          {/* Düzenlemede switch kapatılırsa taahhüt satırı silinecek — bunu
              kaydetmeden önce söyle, kullanıcı veri kaybını fark etmeyebilir. */}
          {isEdit && existingContract && !hasContract && (
            <View style={styles.warnBox}>
              <Text style={styles.warnText}>
                Kaydettiğinde bu aboneliğin taahhüt kaydı silinecek.
              </Text>
            </View>
          )}

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
                <BadgeRow>
                  <Badge
                    label={`Bitiş ${formatDate(contractEndISO, true)}`}
                    tone="info"
                    icon="◷"
                  />
                  <Badge label={`${monthsValue} ay taahhüt`} tone="warn" />
                </BadgeRow>
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
          style={[styles.saveButton, busy && styles.buttonBusy]}
          onPress={handleSave}
          disabled={busy}
          activeOpacity={0.85}
        >
          {saving ? (
            <View style={styles.busyRow}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.saveButtonText}>Kaydediliyor…</Text>
            </View>
          ) : (
            <Text style={styles.saveButtonText}>
              {isEdit ? 'Değişiklikleri Kaydet' : 'Kaydet'}
            </Text>
          )}
        </TouchableOpacity>

        {isEdit && (
          <TouchableOpacity
            style={[styles.deleteButton, busy && styles.buttonBusy]}
            onPress={() => setConfirmDelete(true)}
            disabled={busy}
            activeOpacity={0.85}
          >
            <Text style={styles.deleteButtonText}>Aboneliği Sil</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <ConfirmDialog
        visible={confirmDelete}
        title="Abonelik silinsin mi?"
        message={
          existing
            ? `"${existing.name}" ve varsa taahhüt kaydı kalıcı olarak silinecek. Bu işlem geri alınamaz.`
            : ''
        }
        confirmLabel="Sil"
        destructive
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </KeyboardAvoidingView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Stiller — Section/Field/Chip stilleri components/ui.tsx içinde
// ═══════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scrollContent: { padding: 20, paddingBottom: 60 },
  centerBlock: { justifyContent: 'center', alignItems: 'center', padding: 20 },

  screenTitle: { fontSize: 26, fontWeight: '800', color: COLORS.text, letterSpacing: -0.6 },

  chipRow: { gap: 8, paddingRight: 8, paddingBottom: 4 },
  chipRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  fieldHint: { fontSize: 12, color: COLORS.dim, marginTop: 7, lineHeight: 17 },

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

  warnBox: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.4)',
    borderRadius: RADIUS.sm,
    padding: 12,
    marginBottom: 16,
  },
  warnText: { color: COLORS.warn, fontSize: 13, lineHeight: 19 },

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
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  deleteButton: {
    borderRadius: RADIUS.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.5)',
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  deleteButtonText: { color: COLORS.danger, fontSize: 15, fontWeight: '700' },

  buttonBusy: { opacity: 0.6 },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
