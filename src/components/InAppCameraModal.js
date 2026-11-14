import React, { useCallback, useEffect, useRef, useState } from "react";
import { Modal, StyleSheet, View, Pressable, ActivityIndicator, Platform } from "react-native";
import { Text, Button } from "react-native-paper";
import { CameraView, useCameraPermissions } from "expo-camera";
import { COLORS } from "../theme/colors";
import { SPACING } from "../theme/layout";

// Cámara DENTRO de la app para la foto de la entrega de un desembolso (2026-11-14).
// Con la cámara del teléfono (ImagePicker.launchCameraAsync) Android abre la aplicación de cámara de Samsung, que es
// pesada, y en el Galaxy A16 de JELDER cierra nuestra app para liberar memoria: 4 cierres seguidos con la cámara abierta
// (app_client_errors KILLED_DURING_PICKER). Aquí la vista previa y el disparo ocurren en el mismo proceso, así que la
// app no se manda al fondo y no hay nada que Android pueda cerrar.
//
// Props: visible, onCapture({ uri, name, type }), onClose().

// Tamaño de foto objetivo: ~2–4 megapíxeles. Los celulares de 50 MP generan fotos de 10+ MB y re-codificarlas en el
// teléfono gasta ~200 MB de memoria; para evidencia de entrega sobra con 1600–2400 px de ancho.
const TARGET_LONG_SIDE = 2000;
function pickPictureSize(sizes) {
  try {
    const parsed = (sizes || [])
      .map((s) => {
        const m = String(s).match(/^(\d+)x(\d+)$/i);
        return m ? { s, w: Number(m[1]), h: Number(m[2]) } : null;
      })
      .filter(Boolean)
      .map((x) => ({ ...x, long: Math.max(x.w, x.h), ratio: Math.max(x.w, x.h) / Math.min(x.w, x.h) }));
    // Preferir 4:3 (lo normal en celulares); si no hay, cualquiera.
    const four3 = parsed.filter((x) => Math.abs(x.ratio - 4 / 3) < 0.05);
    const pool = four3.length ? four3 : parsed;
    if (!pool.length) return undefined;
    pool.sort((a, b) => Math.abs(a.long - TARGET_LONG_SIDE) - Math.abs(b.long - TARGET_LONG_SIDE));
    return pool[0].s;
  } catch {
    return undefined;
  }
}

export default function InAppCameraModal({ visible, onCapture, onClose }) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pictureSize, setPictureSize] = useState(undefined);

  useEffect(() => {
    if (visible) {
      setReady(false);
      setBusy(false);
      setError("");
      setPictureSize(undefined);
    }
  }, [visible]);

  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [visible, permission, requestPermission]);

  const onCameraReady = useCallback(async () => {
    setReady(true);
    if (Platform.OS === "android") {
      try {
        const sizes = await cameraRef.current?.getAvailablePictureSizesAsync?.();
        setPictureSize(pickPictureSize(sizes));
      } catch {
        // se usa el tamaño por omisión
      }
    }
  }, []);

  const shoot = async () => {
    if (busy || !ready || !cameraRef.current) return;
    try {
      setBusy(true);
      setError("");
      const pic = await cameraRef.current.takePictureAsync({ quality: 0.7, exif: false, shutterSound: true });
      if (!pic?.uri) throw new Error("La cámara no devolvió la foto");
      const name = pic.uri.split("/").pop() || `foto_${Date.now()}.jpg`;
      onCapture?.({ uri: pic.uri, name: /\.(jpe?g|png)$/i.test(name) ? name : `${name}.jpg`, type: "image/jpeg" });
    } catch (e) {
      setError(e?.message || "No se pudo tomar la foto. Intentá de nuevo.");
      setBusy(false);
    }
  };

  const denied = permission && !permission.granted && !permission.canAskAgain;

  return (
    <Modal visible={!!visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        {permission?.granted ? (
          <>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="back"
              mode="picture"
              pictureSize={pictureSize}
              onCameraReady={onCameraReady}
              onMountError={(e) => setError(e?.message || "No se pudo abrir la cámara")}
            />
            <View style={styles.bottom}>
              {!!error && <Text style={styles.error}>{error}</Text>}
              <View style={styles.controls}>
                <Button mode="text" textColor="#fff" onPress={onClose} disabled={busy}>Cancelar</Button>
                <Pressable
                  onPress={shoot}
                  disabled={busy || !ready}
                  accessibilityRole="button"
                  accessibilityLabel="Tomar foto"
                  style={[styles.shutterOuter, (busy || !ready) && { opacity: 0.5 }]}
                >
                  {busy ? <ActivityIndicator color={COLORS.primary} /> : <View style={styles.shutterInner} />}
                </Pressable>
                <View style={{ width: 88 }} />
              </View>
            </View>
          </>
        ) : (
          <View style={styles.center}>
            {denied ? (
              <>
                <Text style={styles.msg}>La app no tiene permiso para usar la cámara. Activalo en Ajustes del teléfono → Aplicaciones → CrediApp → Permisos.</Text>
                <Button mode="contained" onPress={onClose} style={{ marginTop: SPACING.md }}>Cerrar</Button>
              </>
            ) : (
              <>
                <ActivityIndicator color="#fff" />
                <Button mode="text" textColor="#fff" onPress={onClose} style={{ marginTop: SPACING.md }}>Cancelar</Button>
              </>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.lg },
  msg: { color: "#fff", textAlign: "center" },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, paddingBottom: SPACING.xl, backgroundColor: "rgba(0,0,0,0.35)" },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.md, paddingTop: SPACING.md },
  error: { color: "#ffb4ab", textAlign: "center", paddingHorizontal: SPACING.lg },
  shutterOuter: { width: 74, height: 74, borderRadius: 37, borderWidth: 4, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#fff" },
});
