import React, { useCallback, useContext, useState } from "react";
import { View, StyleSheet, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, Card, Chip, Button, IconButton, ActivityIndicator } from "react-native-paper";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { SessionContext } from "../auth/SessionContext";
import { listQueue, removeFromQueue } from "../offline/queue";
import { retryQueueItem } from "../offline/syncManager";
import { deletePersistedFile } from "../offline/filePersist";
import { useSync } from "../offline/SyncProvider";
import { confirmAction } from "../utils/confirm";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const TYPE_LABEL = {
  PAYMENT: "Pago",
  GUARANTEE_PHOTO: "Foto de garantía",
  CUSTOMER_DOCUMENT: "Documento de cliente",
  CUSTOMER_LOCATION: "Ubicación de cliente",
  VISIT: "Visita de cobranza",
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
  title: { fontWeight: "800", color: COLORS.text, flex: 1 },
  content: { padding: SPACING.lg, paddingBottom: 110, gap: SPACING.sm },
  row: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    ...SHADOW.card,
  },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  label: { fontWeight: "700", color: COLORS.text, flex: 1 },
  muted: { color: COLORS.muted, marginTop: 2, fontSize: 12 },
  errorText: { color: COLORS.danger, marginTop: SPACING.xs, fontSize: 12 },
  actionsRow: { flexDirection: "row", gap: SPACING.xs, marginTop: SPACING.sm },
  actionBtn: { flex: 1, borderRadius: RADIUS.md },
  empty: { textAlign: "center", color: COLORS.muted, marginTop: SPACING.xl, paddingHorizontal: SPACING.xl },
});

export default function PendingSyncScreen() {
  const navigation = useNavigation();
  const { session } = useContext(SessionContext);
  const { syncing, syncNow, refreshPendingCount } = useSync();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setItems(await listQueue());
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onSyncNow = async () => {
    await syncNow();
    await load();
  };

  const onRetry = async (item) => {
    setBusyId(item.id);
    try {
      await retryQueueItem(session.token, item.id);
    } finally {
      setBusyId(null);
      refreshPendingCount();
      load();
    }
  };

  const onDelete = (item) => {
    confirmAction(
      "Eliminar pendiente",
      "¿Eliminar esta acción de la cola? No se va a enviar al servidor.",
      async () => {
        await removeFromQueue(item.id);
        if (item.payload?.file?.uri) await deletePersistedFile(item.payload.file.uri);
        refreshPendingCount();
        load();
      },
      { destructive: true, confirmText: "Eliminar" },
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.headerRow}>
        <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
        <Text variant="headlineSmall" style={styles.title}>Pendientes de sincronizar</Text>
        <Button onPress={onSyncNow} loading={syncing} disabled={syncing}>
          Sincronizar
        </Button>
      </View>

      {loading && <ActivityIndicator style={{ marginTop: SPACING.lg }} />}

      {!loading && (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          ListEmptyComponent={<Text style={styles.empty}>No hay nada pendiente de sincronizar.</Text>}
          renderItem={({ item }) => (
            <Card style={styles.row}>
              <View style={styles.rowTop}>
                <Text style={styles.label}>{item.label || TYPE_LABEL[item.type] || item.type}</Text>
                {item.status === "FAILED" ? (
                  <Chip compact style={{ backgroundColor: COLORS.dangerSoft }} textStyle={{ color: COLORS.danger, fontWeight: "700" }}>
                    Requiere atención
                  </Chip>
                ) : (
                  <Chip compact style={{ backgroundColor: COLORS.warningSoft }} textStyle={{ color: COLORS.warning, fontWeight: "700" }}>
                    Pendiente
                  </Chip>
                )}
              </View>
              <Text style={styles.muted}>{new Date(item.createdAt).toLocaleString("es-NI")}</Text>
              {!!item.lastError && <Text style={styles.errorText}>{item.lastError}</Text>}
              <View style={styles.actionsRow}>
                <Button
                  compact
                  mode="outlined"
                  icon="cloud-upload-outline"
                  onPress={() => onRetry(item)}
                  loading={busyId === item.id}
                  disabled={busyId === item.id}
                  style={styles.actionBtn}
                >
                  Reintentar
                </Button>
                <Button compact mode="outlined" icon="trash-can-outline" onPress={() => onDelete(item)} style={styles.actionBtn}>
                  Eliminar
                </Button>
              </View>
            </Card>
          )}
        />
      )}
    </SafeAreaView>
  );
}
