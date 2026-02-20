import React, { useContext, useRef, useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, TextInput, Button, HelperText, Card } from "react-native-paper";
import { SessionContext } from "../auth/SessionContext";

export default function LoginScreen() {
  const { signIn } = useContext(SessionContext);

  const [user_name, setUser] = useState("admin"); // prueba: admin/supervisor/promotor/cobrador
  const [password, setPass] = useState("1234");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const passRef = useRef(null);

  const onSubmit = async () => {
    try {
      setError("");
      setLoading(true);
      await signIn({ user_name, password });
    } catch (e) {
      setError(e?.message ?? "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, padding: 16, justifyContent: "center" }}>
      <Card style={{ padding: 16, borderRadius: 16 }}>
        <Text variant="headlineSmall" style={{ fontWeight: "700" }}>
          CrediApp
        </Text>
        <Text variant="bodyMedium" style={{ marginTop: 4, opacity: 0.7 }}>
          Inicia sesión para continuar
        </Text>

        <TextInput
          label="Usuario"
          value={user_name}
          onChangeText={setUser}
          autoCapitalize="none"
          style={{ marginTop: 16 }}
          returnKeyType="next"
          onSubmitEditing={() => passRef.current?.focus()}
        />

        <TextInput
          ref={passRef}
          label="Contraseña"
          value={password}
          onChangeText={setPass}
          secureTextEntry
          style={{ marginTop: 12 }}
          returnKeyType="done"
          onSubmitEditing={onSubmit}
        />

        <HelperText type="error" visible={!!error}>
          {error}
        </HelperText>

        <Button
          mode="contained"
          onPress={onSubmit}
          loading={loading}
          disabled={loading}
          style={{ marginTop: 8, borderRadius: 10 }}
        >
          Entrar
        </Button>

        <View style={{ marginTop: 12 }}>
          <Text variant="labelSmall" style={{ opacity: 0.7 }}>
            Usuarios demo: admin / supervisor / promotor / cobrador — pass: 1234
          </Text>
        </View>
      </Card>
    </SafeAreaView>
  );
}