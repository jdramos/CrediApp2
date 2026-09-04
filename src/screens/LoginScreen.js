import React, { useContext, useRef, useState } from "react";
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, TextInput, Button, HelperText } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, { FadeInDown, FadeIn, ZoomIn } from "react-native-reanimated";
import { SessionContext } from "../auth/SessionContext";
import { COLORS, GRADIENTS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: SPACING.xl,
  },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  brand: { color: COLORS.onGradient, fontWeight: "800", letterSpacing: 0.5 },
  tagline: { color: COLORS.onGradientMuted, marginTop: 4 },
  sheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: RADIUS.lg + 6,
    borderTopRightRadius: RADIUS.lg + 6,
    padding: SPACING.lg,
    paddingTop: SPACING.xl,
    gap: SPACING.sm,
    ...SHADOW.card,
  },
  title: { fontWeight: "800", color: COLORS.text },
  subtitle: { marginTop: 2, color: COLORS.muted },
  input: { marginTop: SPACING.md, backgroundColor: COLORS.card },
  input2: { marginTop: SPACING.sm, backgroundColor: COLORS.card },
  btn: { marginTop: SPACING.md, borderRadius: RADIUS.md },
  footer: { marginTop: SPACING.md, alignItems: "center" },
  footerText: { opacity: 0.75, color: COLORS.muted },
});

export default function LoginScreen() {
  const { signIn } = useContext(SessionContext);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const passRef = useRef(null);

  const onSubmit = async () => {
    setError("");
    const u = username.trim();
    const p = password.trim();

    if (!u || !p) {
      setError("Debe ingresar usuario y contraseña");
      return;
    }

    try {
      setLoading(true);
      await signIn({ username: u, password: p });
    } catch (e) {
      setError(e?.message ?? "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = username.trim().length > 0 && password.trim().length > 0;

  return (
    <LinearGradient colors={GRADIENTS.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
          >
            <Animated.View entering={FadeIn.duration(500)} style={styles.hero}>
              <Animated.View entering={ZoomIn.delay(120).springify()} style={styles.logoCircle}>
                <MaterialCommunityIcons name="hand-coin-outline" size={44} color={COLORS.onGradient} />
              </Animated.View>
              <Text variant="headlineMedium" style={styles.brand}>CrediApp</Text>
              <Text style={styles.tagline}>Microfinanzas al alcance de tu mano</Text>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(150).springify()} style={styles.sheet}>
              <Text variant="titleLarge" style={styles.title}>Bienvenido</Text>
              <Text variant="bodyMedium" style={styles.subtitle}>Inicia sesión para continuar</Text>

              <TextInput
                label="Usuario"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                mode="outlined"
                style={styles.input}
                outlineStyle={{ borderRadius: RADIUS.md, borderColor: COLORS.border }}
                returnKeyType="next"
                onSubmitEditing={() => passRef.current?.focus()}
                left={<TextInput.Icon icon="account-outline" />}
              />

              <TextInput
                ref={passRef}
                label="Contraseña"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                mode="outlined"
                style={styles.input2}
                outlineStyle={{ borderRadius: RADIUS.md, borderColor: COLORS.border }}
                returnKeyType="done"
                onSubmitEditing={onSubmit}
                left={<TextInput.Icon icon="lock-outline" />}
              />

              <HelperText type="error" visible={!!error}>
                {error}
              </HelperText>

              <Button
                mode="contained"
                onPress={onSubmit}
                loading={loading}
                disabled={loading || !canSubmit}
                style={styles.btn}
                contentStyle={{ height: 48 }}
                labelStyle={{ fontWeight: "700" }}
              >
                Entrar
              </Button>

              <View style={styles.footer}>
                <Text variant="labelSmall" style={styles.footerText}>
                  Ingrese con su usuario y contraseña de CrediMaster.
                </Text>
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}
