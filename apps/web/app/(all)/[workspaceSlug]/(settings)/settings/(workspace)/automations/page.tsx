/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Navigate, useParams } from "react-router";

/** Legacy settings URL → workspace automations page */
export default function AutomationsSettingsRedirect() {
  const { workspaceSlug } = useParams();
  return <Navigate to={`/${workspaceSlug}/automations/`} replace />;
}
