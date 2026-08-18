  import React, { useContext, useRef, useState } from "react";
  import { View, StyleSheet } from "react-native";
  import { SafeAreaView } from "react-native-safe-area-context";
  import { Text, TextInput, Button, HelperText, Card } from "react-native-paper";
  import { SessionContext } from "../auth/SessionContext";
  import { getDeviceId } from "../utils/getDevice";
  import { COLORS } from "../theme/colors";
  import { RADIUS, SHADOW, SPACING } from "../theme/layout";

  const styles = StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: COLORS.bg,
      paddingHorizontal: SPACING.lg,
      justifyContent: "center",
    },
    card: {
      backgroundColor: COLORS.card,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: COLORS.border,
      padding: SPACING.md,
      ...SHADOW.card,
    },
    title: {
      fontWeight: "800",
      color: COLORS.text,
    },
    subtitle: {
      marginTop: 4,
      opacity: 0.8,
      color: COLORS.muted,
    },
    input: {
      marginTop: SPACING.md,
      backgroundColor: COLORS.card,
    },
    input2: {
      marginTop: SPACING.sm,
      backgroundColor: COLORS.card,
    },
    btn: {
      marginTop: SPACING.sm,
      borderRadius: RADIUS.md,
    },
    footer: {
      marginTop: SPACING.md,
    },
    footerText: {
      opacity: 0.75,
      color: COLORS.muted,
    },
  });

  export default function LoginScreen() {
    const { signIn } = useContext(SessionContext);
    const [nomUser, setNomUser] = useState("");
    const [pasUser, setPasUser] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const passRef = useRef(null);

    const onSubmit = async () => {
      try {
        setError("");

        const u = nomUser.trim();
        const p = pasUser.trim();

        if (!u || !p) {
          setError("Debe ingresar usuario y contraseña");
          return;
        }

        setLoading(true);
        await signIn({ nomUser: u, pasUser: p });
      } catch (e) {
        setError(e?.message ?? "Error al iniciar sesión");
      } finally {
        setLoading(false);
      }
    };

    const canSubmit = nomUser.trim().length > 0 && pasUser.trim().length > 0;

    return (
      <SafeAreaView style={styles.safe}>
        <Card style={styles.card}>
          <Text variant="headlineSmall" style={styles.title}>
            CrediApp
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            Inicia sesión para continuar
          </Text>

          <TextInput
            label="Usuario"
            value={nomUser}
            onChangeText={setNomUser}
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
            value={pasUser}
            onChangeText={setPasUser}
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
            contentStyle={{ height: 46 }}
            labelStyle={{ fontWeight: "700" }}
          >
            Entrar
          </Button>

          <View style={styles.footer}>
            <Text variant="labelSmall" style={styles.footerText}>
              Usuarios demo: admin / supervisor / promotor / cobrador — pass: 1234
            </Text>
          </View>
        </Card>
      </SafeAreaView>
    );
  }