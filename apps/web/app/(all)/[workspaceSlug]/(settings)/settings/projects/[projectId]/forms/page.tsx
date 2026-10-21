/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Navigate, useParams } from "react-router";

/** Legacy project settings URL → workspace forms page */
export default function ProjectFormsSettingsRedirect() {
  const { workspaceSlug, projectId } = useParams();
  return <Navigate to={`/${workspaceSlug}/forms?projectId=${projectId}`} replace />;
}
