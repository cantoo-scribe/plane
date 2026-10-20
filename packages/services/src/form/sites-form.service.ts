/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TIssueFormPublic, TIssueFormSubmitResult } from "@plane/types";
import { APIService } from "../api.service";

export class SitesFormService extends APIService {
  constructor(BASE_URL?: string) {
    super(BASE_URL || API_BASE_URL);
  }

  async retrieve(anchor: string): Promise<TIssueFormPublic> {
    return this.get(`/api/public/forms/${anchor}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async submit(anchor: string, answers: Record<string, unknown>): Promise<TIssueFormSubmitResult> {
    return this.post(`/api/public/forms/${anchor}/submit/`, { answers, website: "" })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
