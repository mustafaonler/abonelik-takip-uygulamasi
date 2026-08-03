import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { COLORS, RADIUS } from '../lib/theme';

// ═══════════════════════════════════════════════════════════════════════════
// ConfirmDialog — geri alınamaz işlemler için onay kutusu
//
// Neden Alert.alert değil: react-native-web'de Alert.alert boş bir fonksiyon
// (`static alert() {}`), yani web'de pencere hiç açılmıyor ve onay callback'i
// hiç çalışmıyor. Silme gibi bir işlemi ona bağlamak, web'de butonun sessizce
// hiçbir şey yapmaması demek olurdu. Modal her iki platformda da çalışıyor.
// ═══════════════════════════════════════════════════════════════════════════

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Sil',
  cancelLabel = 'Vazgeç',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const accent = destructive ? COLORS.danger : COLORS.primary;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Android donanım geri tuşu ve web'de Esc — kapatma yolu her zaman açık.
      onRequestClose={busy ? undefined : onCancel}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
              disabled={busy}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, { backgroundColor: accent }, busy && styles.busy]}
              onPress={onConfirm}
              disabled={busy}
              activeOpacity={0.85}
            >
              {busy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.confirmText}>{confirmLabel}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: COLORS.bgElevated,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: RADIUS.lg,
    padding: 22,
  },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  message: { fontSize: 14, color: COLORS.muted, lineHeight: 21, marginTop: 10 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 22 },
  button: {
    flex: 1,
    borderRadius: RADIUS.sm,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  cancelButton: {
    backgroundColor: COLORS.surfaceStrong,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelText: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
  confirmText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  busy: { opacity: 0.7 },
});
