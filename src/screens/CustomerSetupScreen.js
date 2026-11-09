import React, { useCallback, useContext, useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, Button, Chip, ActivityIndicator } from "react-native-paper";
import { useFocusEffect } from "@react-navigation/native";
import { SessionContext } from "../auth/SessionContext";
import { getCustomer } from "../api/customerApi";
import { getCustomerChecklist } from "../api/customerDocumentApi";
import { getCurrentEvaluation } from "../api/customerEvaluationApi";
import {
  isLocalCustomerId, getRealCustomerId, getQueuedCustomerFields, getQueuedEvaluation,
} from "../offline/localCustomers";
import { COLORS } from "../theme/colors";
import { RADIUS, SHADOW, SPACING } from "../theme/layout";

// "Completar expediente": se abre justo después de crear un cliente. Reúne lo que falta
// para dejarlo listo: ubicación (con fotos de la casa y el negocio), documentos
// obligatorios, evaluación financiera y, al final, la solicitud de crédito. Cada paso abre
// su pantalla y al volver se actualiza el estado; ninguno bloquea a los demás.
//
// Si el cliente se creó SIN señal (id "local:...") todavía no existe en el servidor: se puede
// agregar su ubicación y fotos y la evaluación (quedan en la cola y se envían detrás del alta),
// pero no los documentos del expediente ni la solicitud de crédito, que necesitan al cliente
// ya registrado. En cuanto se registra, esta pantalla cambia sola al id real.

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xl, gap: SPACING.md },
  header: { fontWeight: "800", color: COLORS.text },
  hint: { color: COLORS.muted, fontSize: 13 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.xs,
    ...SHADOW.card,
  },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.sm },
  title: { fontWeight: "800", color: COLORS.text, flex: 1 },
});

const isOk = (status) => String(status || "").toUpperCase() === "OK";

function StepCard({ icon, title, description, done, doneLabel, pendingLabel, actionLabel, onPress, disabledReason }) {
  return (
    <View style={styles.card}>
      <View style={styles.rowTop}>
        <Text variant="titleMedium" style={styles.title}>{title}</Text>
        <Chip
          compact
          icon={done ? "check-circle" : "clock-outline"}
          style={{ backgroundColor: done ? COLORS.successSoft : COLORS.warningSoft }}
          textStyle={{ color: done ? COLORS.success : COLORS.warning, fontWeight: "700" }}
        >
          {done ? doneLabel : pendingLabel}
        </Chip>
      </View>
      <Text style={styles.hint}>{description}</Text>
      {disabledReason ? (
        <Text style={styles.hint}>{disabledReason}</Text>
      ) : (
        <Button
          mode={done ? "outlined" : "contained"}
          icon={icon}
          onPress={onPress}
          style={{ borderRadius: RADIUS.md, alignSelf: "flex-start", marginTop: SPACING.xs }}
        >
          {actionLabel}
        </Button>
      )}
    </View>
  );
}

export default function CustomerSetupScreen({ route, navigation }) {
  const { customerId, customerName } = route.params;
  const { session } = useContext(SessionContext);
  const perms = session?.permissions || [];
  const canLocation = perms.includes("clientes.editar") || perms.includes("clientes.documentos.subir");
  const canChecklist = perms.includes("clientes.checklist.ver");
  const canEvaluate = perms.includes("clientes.evaluacion.insertar");
  const canSeeEvaluation = canEvaluate || perms.includes("clientes.evaluacion.ver");
  const canRequestLoan = perms.includes("creditos.insertar");

  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState(null);
  const [checklist, setChecklist] = useState(null);
  const [evaluation, setEvaluation] = useState(null);
  const [queuedEval, setQueuedEval] = useState(null); // evaluación guardada sin señal, por enviar
  const isLocal = isLocalCustomerId(customerId);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        if (isLocalCustomerId(customerId)) {
          const real = await getRealCustomerId(customerId);
          if (real) {
            // Ya se registró: se sigue con el id real (esto vuelve a cargar la pantalla).
            navigation.setParams({ customerId: real });
            return;
          }
          const [fields, qe] = await Promise.all([getQueuedCustomerFields(customerId), getQueuedEvaluation(customerId)]);
          if (!alive) return;
          setCustomer(fields);
          setChecklist(null);
          setEvaluation(null);
          setQueuedEval(qe?.payload || null);
          setLoading(false);
          return;
        }
        const [c, cl, ev, qe] = await Promise.all([
          getCustomer(session.token, customerId).catch(() => null),
          canChecklist ? getCustomerChecklist(session.token, customerId).catch(() => null) : null,
          canSeeEvaluation ? getCurrentEvaluation(session.token, customerId).catch(() => null) : null,
          getQueuedEvaluation(customerId),
        ]);
        if (!alive) return;
        setCustomer(c?.data?.customer || null);
        setChecklist(Array.isArray(cl) ? cl : null);
        setEvaluation(ev && ev.id ? ev : null);
        setQueuedEval(qe?.payload || null);
        setLoading(false);
      })();
      return () => { alive = false; };
    }, [session.token, customerId, canChecklist, canSeeEvaluation, navigation]),
  );

  const hasLocation =
    (customer?.home_lat != null && customer?.home_lng != null) ||
    (customer?.business_lat != null && customer?.business_lng != null);

  const mandatory = (checklist || []).filter((i) => i.is_mandatory);
  const mandatoryDone = mandatory.filter((i) => isOk(i.status)).length;
  const docsDone = mandatory.length > 0 && mandatoryDone === mandatory.length;

  const params = { customerId, customerName };

  const requestLoan = () => {
    // El cliente recién creado ya queda elegido en la solicitud.
    navigation.navigate("Creditos", { screen: "NewLoanRequest", params: { customer: customer || { id: customerId, customer_name: customerName } } });
  };

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <Text variant="titleLarge" style={styles.header}>{isLocal ? "Cliente guardado sin conexión" : "Cliente guardado"}</Text>
          <Text style={styles.hint}>
            {customerName ? `${customerName}. ` : ""}
            {isLocal
              ? "Se registrará solo cuando vuelva la señal (puede verlo en Pendientes de sincronizar). Mientras tanto agregue su ubicación y la evaluación financiera."
              : "Complete lo que falta del expediente. Puede hacerlo ahora o más tarde desde su ficha."}
          </Text>
        </View>

        {loading && <ActivityIndicator color={COLORS.primary} />}

        <StepCard
          icon="map-marker-outline"
          title="Ubicación y fotos"
          description="Marque dónde queda la casa y el negocio, y tome fotos de la fachada o de cómo llegar."
          done={hasLocation}
          doneLabel="Con ubicación"
          pendingLabel="Pendiente"
          actionLabel={hasLocation ? "Ver / editar ubicación" : "Agregar ubicación y fotos"}
          onPress={() => navigation.navigate("CustomerLocation", params)}
          disabledReason={canLocation ? null : "Su usuario no tiene permiso para guardar ubicaciones."}
        />

        {canChecklist && (
          <StepCard
            icon="folder-image"
            title="Documentos obligatorios"
            description={
              isLocal
                ? "Documentos obligatorios del expediente (cédula, comprobantes...)."
                : mandatory.length
                  ? `${mandatoryDone} de ${mandatory.length} documentos obligatorios entregados. Tome una foto de cada uno.`
                  : "Este cliente no tiene documentos obligatorios en su expediente."
            }
            done={isLocal ? false : mandatory.length === 0 ? true : docsDone}
            doneLabel={mandatory.length === 0 ? "Sin obligatorios" : "Completos"}
            pendingLabel={isLocal ? "En espera" : `Faltan ${mandatory.length - mandatoryDone}`}
            actionLabel={docsDone ? "Ver expediente" : "Subir documentos"}
            onPress={() => navigation.navigate("CustomerFile", params)}
            disabledReason={isLocal ? "Podrá subir los documentos del expediente cuando el cliente quede registrado (al volver la señal)." : null}
          />
        )}

        {canSeeEvaluation && (
          <StepCard
            icon="chart-box-outline"
            title="Evaluación financiera"
            description={
              evaluation
                ? `Puntaje ${evaluation.final_score} · riesgo ${String(evaluation.risk_level || "").toLowerCase().replace("_", " ")}.`
                : queuedEval
                  ? "Guardada en el teléfono. Se envía sola cuando haya señal y el servidor calcula el puntaje."
                  : "Ingresos, gastos y deudas del cliente para medir su capacidad de pago."
            }
            done={!!evaluation || !!queuedEval}
            doneLabel={evaluation ? "Hecha" : "Por enviar"}
            pendingLabel="Pendiente"
            actionLabel={evaluation || queuedEval ? "Ver evaluación" : "Hacer evaluación"}
            onPress={() => navigation.navigate("CustomerEvaluation", params)}
            disabledReason={!evaluation && !queuedEval && !canEvaluate ? "Su usuario no tiene permiso para registrar evaluaciones." : null}
          />
        )}

        <View style={{ gap: SPACING.sm }}>
          {canRequestLoan && !isLocal && (
            <Button mode="contained" icon="cash-plus" onPress={requestLoan} style={{ borderRadius: RADIUS.md }}>
              Crear solicitud de crédito
            </Button>
          )}
          {canRequestLoan && isLocal && (
            <Text style={styles.hint}>La solicitud de crédito se podrá crear cuando el cliente quede registrado (al volver la señal).</Text>
          )}
          <Button
            mode="outlined"
            onPress={() => (isLocal ? navigation.popToTop() : navigation.replace("CustomerDetail", { customerId }))}
            style={{ borderRadius: RADIUS.md }}
          >
            {isLocal ? "Terminar" : "Terminar y ver la ficha"}
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
