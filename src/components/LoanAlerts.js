import React from "react";
import { View } from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS } from "../theme/colors";
import { RADIUS, SPACING } from "../theme/layout";

const dmy = (iso) => {
  const [y, m, d] = String(iso || "").slice(0, 10).split("-");
  return d ? `${d}/${m}/${y}` : String(iso || "");
};

function Notice({ tone, icon, title, lines }) {
  const palette =
    tone === "danger"
      ? { bg: COLORS.dangerSoft, fg: COLORS.danger }
      : tone === "warning"
        ? { bg: COLORS.warningSoft, fg: COLORS.warning }
        : { bg: COLORS.primarySoft, fg: COLORS.primary };
  return (
    <View
      style={{
        backgroundColor: palette.bg,
        borderColor: palette.fg,
        borderWidth: 1,
        borderRadius: RADIUS.md,
        padding: SPACING.md,
        flexDirection: "row",
        gap: SPACING.sm,
      }}
    >
      <MaterialCommunityIcons name={icon} size={22} color={palette.fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: "800", color: COLORS.text }}>{title}</Text>
        {lines.map((l, i) => (
          <Text key={i} style={{ color: COLORS.text, marginTop: 2, fontSize: 13 }}>{l}</Text>
        ))}
      </View>
    </View>
  );
}

// ¿La cédula vencida congela la solicitud? (política de la empresa; el servidor también lo exige).
export const isIdentityFrozen = (status) => status?.status === "EXPIRED" && Boolean(status?.freeze_policy);

// Avisos del cliente en la solicitud: cédula vencida / por vencer y represtamo (mismos textos que la web).
export default function LoanAlerts({ identityStatus, represtamo }) {
  const notices = [];
  if (identityStatus && ["EXPIRED", "EXPIRING"].includes(identityStatus.status)) {
    const date = dmy(identityStatus.expiration_date);
    if (identityStatus.status === "EXPIRING") {
      notices.push(
        <Notice
          key="id"
          tone="info"
          icon="card-account-details-outline"
          title={`La cédula del cliente ${identityStatus.days_left === 0 ? "vence hoy" : `vence en ${identityStatus.days_left} días`} (${date})`}
          lines={["Pida al cliente su cédula renovada y actualice la fecha de vencimiento en su ficha."]}
        />,
      );
    } else {
      const frozen = Boolean(identityStatus.freeze_policy);
      notices.push(
        <Notice
          key="id"
          tone={frozen ? "danger" : "warning"}
          icon="card-account-details-outline"
          title={`La cédula del cliente venció el ${date}`}
          lines={[
            frozen
              ? "Por política de crédito la solicitud está congelada: no se podrá registrar, aprobar ni desembolsar hasta actualizar la fecha de vencimiento en la ficha del cliente."
              : "Pida al cliente su cédula renovada y actualice la fecha de vencimiento en su ficha.",
          ]}
        />,
      );
    }
  }
  if (represtamo && represtamo.eligible === false) {
    notices.push(
      <Notice
        key="rep"
        tone="warning"
        icon="account-alert-outline"
        title="Cliente no apto para represtamo según la política de crédito"
        lines={[
          `Motivo: ${(represtamo.reasons || []).join("; ")}.`,
          "La solicitud no se bloquea, pero se enviará obligatoriamente a Comité de Crédito, aunque el monto esté por debajo del mínimo de comité.",
        ]}
      />,
    );
  }
  if (!notices.length) return null;
  return <View style={{ gap: SPACING.sm }}>{notices}</View>;
}
