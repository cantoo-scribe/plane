/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssueCustomPropertyValueWrite } from "../work-item-types";

/** Map of property_id -> write payload (used in issue modal context). */
export type TIssuePropertyValues = Record<string, TIssueCustomPropertyValueWrite>;
export type TIssuePropertyValueErrors = Record<string, string | string[] | unknown>;
