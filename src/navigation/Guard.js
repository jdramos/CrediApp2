import React, { useContext } from "react";
import { SessionContext } from "../auth/SessionContext";
import NotAuthorizedScreen from "../screens/NotAuthorizedScreen";

export default function Guard({ perm, children }) {
  const { hasPerm } = useContext(SessionContext);

  if (!hasPerm(perm)) return <NotAuthorizedScreen />;
  return children;
}