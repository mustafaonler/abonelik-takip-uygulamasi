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
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { toErrorMessage } from '../../lib/errors';
import { COLORS, RADIUS } from '../../lib/theme';
import { Badge, BadgeRow, Chip, Field, Section } from '../../components/ui';
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
import { useServiceTemplates } from '../../hooks/useServiceTemplates';
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
// Abonelik & taahhüt formu — Scope 4
//
// Şablon seçim ekranından `templateId` ile gelinir; parametre yoksa "Elle Ekle".
// Kaydetme sırası: subscriptions → contracts. REST üzerinde transaction
// olmadığı için taahhüt kaydı başarısız olursa abonelik geri alınır.
// ═══════════════════════════════════════════════════════════════════════════

export default function AddFormScreen() {
  const { templateId } = useLocalSearchParams<{ templateId?: string }>();

  // Katalog zaten şablon ekranında çekildi; burada tekrar çekiyoruz çünkü form
  // derin bağlantıyla (veya yenilemeden sonra) doğrudan da açılabilmeli.
  // 46 satırlık global katalog — ayrı bir tek-kayıt sorgusu kurmaya değmiyor.
  const { templates, categories, loading, error, refetch } = useServiceTemplates();

  const template = templateId
    ? (templates.find((t) => t.id === templateId) ?? null)
    : null;

  if (loading) {
    return (
      <View style={[styles.container, styles.centerBlock]}>
        <StatusBar style="light" />
        <ActivityIndicator color={COLORS.primaryLight} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centerBlock]}>
        <StatusBar style="light" />
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={refetch} style={styles.retrySmall}>
            <Text style={styles.retrySmallText}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Şablon seçildiyse ama katalogda bulunamadıysa (silinmiş/pasife alınmış)
  // formu boş açmak yerine durumu söyle — sessizce "Elle Ekle"ye düşmek
  // kullanıcının seçtiği servisi kaybettiğini gizlerdi.
  if (templateId && !template) {
    return (
      <View style={[styles.container, styles.centerBlock]}>
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
    <SubscriptionForm
      template={template}
      categories={categories}
      onSaved={() => router.replace('/(tabs)')}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Form
// ═══════════════════════════════════════════════════════════════════════════

function SubscriptionForm({
  template,
  categories,
  onSaved,
}: {
  template: ServiceTemplate | null;
  categories: Category[];
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
        <Text style={styles.screenTitle}>{template?.name ?? 'Yeni Abonelik'}</Text>
        <BadgeRow>
          <Badge
            label={template ? 'Şablondan' : 'Elle giriş'}
            tone={template ? 'info' : 'neutral'}
            icon={template ? '★' : '✎'}
          />
          {template?.provider_name ? (
            <Badge label={template.provider_name} tone="neutral" />
          ) : null}
          {template?.supports_contract ? (
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
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <View style={styles.savingRow}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.saveButtonText}>Kaydediliyor…</Text>
            </View>
          ) : (
            <Text style={styles.saveButtonText}>Kaydet</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
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
  savingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
