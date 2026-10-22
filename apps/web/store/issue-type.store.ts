/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
import type {
  TIssueCustomProperty,
  TIssueCustomPropertyOption,
  TIssueCustomPropertyValue,
  TIssueCustomPropertyValueWrite,
  TIssueType,
} from "@plane/types";
import { IssueTypeService } from "@/services/issue/issue_type.service";
import type { CoreRootStore } from "./root.store";

export interface IIssueTypeStore {
  typeMap: Record<string, TIssueType>;
  propertyMap: Record<string, TIssueCustomProperty>;
  valueMap: Record<string, Record<string, TIssueCustomPropertyValue>>;
  fetchedTypesMap: Record<string, boolean>;
  fetchedPropertiesMap: Record<string, boolean>;
  getProjectIssueTypes: (projectId: string | undefined | null) => TIssueType[];
  getWorkspaceIssueTypes: (workspaceId: string | undefined | null) => TIssueType[];
  getDefaultIssueTypeId: (projectId: string | undefined | null) => string | null;
  getIssueTypeById: (typeId: string | undefined | null) => TIssueType | undefined;
  getPropertiesForType: (typeId: string | undefined | null) => TIssueCustomProperty[];
  getPropertyById: (propertyId: string) => TIssueCustomProperty | undefined;
  getIssuePropertyValues: (issueId: string) => Record<string, TIssueCustomPropertyValue>;
  fetchWorkspaceIssueTypes: (workspaceSlug: string) => Promise<TIssueType[]>;
  createWorkspaceIssueType: (workspaceSlug: string, data: Partial<TIssueType>) => Promise<TIssueType>;
  updateWorkspaceIssueType: (workspaceSlug: string, typeId: string, data: Partial<TIssueType>) => Promise<TIssueType>;
  deleteWorkspaceIssueType: (workspaceSlug: string, typeId: string) => Promise<void>;
  markWorkspaceIssueTypeAsDefault: (workspaceSlug: string, typeId: string) => Promise<void>;
  fetchWorkspaceProperties: (workspaceSlug: string, typeId: string) => Promise<TIssueCustomProperty[]>;
  createWorkspaceProperty: (
    workspaceSlug: string,
    typeId: string,
    data: Partial<TIssueCustomProperty> & { options?: Partial<TIssueCustomPropertyOption>[] }
  ) => Promise<TIssueCustomProperty>;
  updateWorkspaceProperty: (
    workspaceSlug: string,
    typeId: string,
    propertyId: string,
    data: Partial<TIssueCustomProperty>
  ) => Promise<TIssueCustomProperty>;
  deleteWorkspaceProperty: (workspaceSlug: string, typeId: string, propertyId: string) => Promise<void>;
  fetchProjectIssueTypes: (workspaceSlug: string, projectId: string) => Promise<TIssueType[]>;
  createIssueType: (workspaceSlug: string, projectId: string, data: Partial<TIssueType>) => Promise<TIssueType>;
  updateIssueType: (
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    data: Partial<TIssueType>
  ) => Promise<TIssueType>;
  deleteIssueType: (workspaceSlug: string, projectId: string, typeId: string) => Promise<void>;
  markAsDefault: (workspaceSlug: string, projectId: string, typeId: string) => Promise<void>;
  fetchProperties: (workspaceSlug: string, projectId: string, typeId: string) => Promise<TIssueCustomProperty[]>;
  createProperty: (
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    data: Partial<TIssueCustomProperty> & { options?: Partial<TIssueCustomPropertyOption>[] }
  ) => Promise<TIssueCustomProperty>;
  updateProperty: (
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    propertyId: string,
    data: Partial<TIssueCustomProperty>
  ) => Promise<TIssueCustomProperty>;
  deleteProperty: (workspaceSlug: string, projectId: string, typeId: string, propertyId: string) => Promise<void>;
  createOption: (
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    propertyId: string,
    data: Partial<TIssueCustomPropertyOption>
  ) => Promise<TIssueCustomPropertyOption>;
  fetchIssuePropertyValues: (
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ) => Promise<TIssueCustomPropertyValue[]>;
  upsertIssuePropertyValues: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    payloads: TIssueCustomPropertyValueWrite[]
  ) => Promise<void>;
}

export class IssueTypeStore implements IIssueTypeStore {
  rootStore: CoreRootStore;
  typeMap: Record<string, TIssueType> = {};
  propertyMap: Record<string, TIssueCustomProperty> = {};
  valueMap: Record<string, Record<string, TIssueCustomPropertyValue>> = {};
  fetchedTypesMap: Record<string, boolean> = {};
  fetchedPropertiesMap: Record<string, boolean> = {};
  service: IssueTypeService;

  constructor(_rootStore: CoreRootStore) {
    makeObservable(this, {
      typeMap: observable,
      propertyMap: observable,
      valueMap: observable,
      fetchedTypesMap: observable,
      fetchedPropertiesMap: observable,
      fetchWorkspaceIssueTypes: action,
      createWorkspaceIssueType: action,
      updateWorkspaceIssueType: action,
      deleteWorkspaceIssueType: action,
      markWorkspaceIssueTypeAsDefault: action,
      fetchWorkspaceProperties: action,
      createWorkspaceProperty: action,
      updateWorkspaceProperty: action,
      deleteWorkspaceProperty: action,
      fetchProjectIssueTypes: action,
      createIssueType: action,
      updateIssueType: action,
      deleteIssueType: action,
      markAsDefault: action,
      fetchProperties: action,
      createProperty: action,
      updateProperty: action,
      deleteProperty: action,
      createOption: action,
      fetchIssuePropertyValues: action,
      upsertIssuePropertyValues: action,
    });
    this.rootStore = _rootStore;
    this.service = new IssueTypeService();
  }

  getProjectIssueTypes = computedFn((projectId: string | undefined | null) => {
    if (!projectId) return [];
    return Object.values(this.typeMap).filter((type) => type.project_ids?.includes(projectId));
  });

  getWorkspaceIssueTypes = computedFn((workspaceId: string | undefined | null) => {
    if (!workspaceId) return [];
    return Object.values(this.typeMap).filter((type) => type.workspace_id === workspaceId);
  });

  getDefaultIssueTypeId = computedFn((projectId: string | undefined | null) => {
    const types = this.getProjectIssueTypes(projectId);
    return types.find((t) => t.is_default)?.id ?? types[0]?.id ?? null;
  });

  getIssueTypeById = computedFn((typeId: string | undefined | null) => {
    if (!typeId) return undefined;
    return this.typeMap[typeId];
  });

  getPropertiesForType = computedFn((typeId: string | undefined | null) => {
    if (!typeId) return [];
    return Object.values(this.propertyMap)
      .filter((p) => p.issue_type_id === typeId && p.is_active)
      .toSorted((a, b) => a.sort_order - b.sort_order);
  });

  getPropertyById = computedFn((propertyId: string) => this.propertyMap[propertyId]);

  getIssuePropertyValues = computedFn((issueId: string) => this.valueMap[issueId] ?? {});

  fetchWorkspaceIssueTypes = async (workspaceSlug: string) => {
    const types = await this.service.fetchWorkspaceIssueTypes(workspaceSlug);
    runInAction(() => {
      types.forEach((type) => {
        this.typeMap[type.id] = type;
      });
      this.fetchedTypesMap[`workspace:${workspaceSlug}`] = true;
    });
    return types;
  };

  createWorkspaceIssueType = async (workspaceSlug: string, data: Partial<TIssueType>) => {
    const type = await this.service.createWorkspaceIssueType(workspaceSlug, data);
    runInAction(() => {
      this.typeMap[type.id] = type;
    });
    return type;
  };

  updateWorkspaceIssueType = async (workspaceSlug: string, typeId: string, data: Partial<TIssueType>) => {
    const type = await this.service.updateWorkspaceIssueType(workspaceSlug, typeId, data);
    runInAction(() => {
      this.typeMap[type.id] = { ...this.typeMap[type.id], ...type };
    });
    return type;
  };

  deleteWorkspaceIssueType = async (workspaceSlug: string, typeId: string) => {
    await this.service.deleteWorkspaceIssueType(workspaceSlug, typeId);
    runInAction(() => {
      delete this.typeMap[typeId];
      Object.keys(this.propertyMap).forEach((pid) => {
        if (this.propertyMap[pid].issue_type_id === typeId) delete this.propertyMap[pid];
      });
    });
  };

  markWorkspaceIssueTypeAsDefault = async (workspaceSlug: string, typeId: string) => {
    await this.service.markWorkspaceIssueTypeAsDefault(workspaceSlug, typeId);
    runInAction(() => {
      Object.values(this.typeMap).forEach((type) => {
        if (type.workspace_id === this.typeMap[typeId]?.workspace_id) {
          this.typeMap[type.id] = { ...type, is_default: type.id === typeId };
        }
      });
    });
  };

  fetchWorkspaceProperties = async (workspaceSlug: string, typeId: string) => {
    const properties = await this.service.fetchWorkspaceProperties(workspaceSlug, typeId);
    runInAction(() => {
      properties.forEach((prop) => {
        this.propertyMap[prop.id] = prop;
      });
      this.fetchedPropertiesMap[typeId] = true;
    });
    return properties;
  };

  createWorkspaceProperty = async (
    workspaceSlug: string,
    typeId: string,
    data: Partial<TIssueCustomProperty> & { options?: Partial<TIssueCustomPropertyOption>[] }
  ) => {
    const prop = await this.service.createWorkspaceProperty(workspaceSlug, typeId, data);
    runInAction(() => {
      this.propertyMap[prop.id] = prop;
    });
    return prop;
  };

  updateWorkspaceProperty = async (
    workspaceSlug: string,
    typeId: string,
    propertyId: string,
    data: Partial<TIssueCustomProperty>
  ) => {
    const prop = await this.service.updateWorkspaceProperty(workspaceSlug, typeId, propertyId, data);
    runInAction(() => {
      this.propertyMap[prop.id] = prop;
    });
    return prop;
  };

  deleteWorkspaceProperty = async (workspaceSlug: string, typeId: string, propertyId: string) => {
    await this.service.deleteWorkspaceProperty(workspaceSlug, typeId, propertyId);
    runInAction(() => {
      delete this.propertyMap[propertyId];
    });
  };

  fetchProjectIssueTypes = async (workspaceSlug: string, projectId: string) => {
    const types = await this.service.fetchProjectIssueTypes(workspaceSlug, projectId);
    runInAction(() => {
      types.forEach((type) => {
        const projectIds = new Set([...(type.project_ids ?? []), projectId]);
        this.typeMap[type.id] = {
          ...type,
          project_ids: Array.from(projectIds),
        };
      });
      this.fetchedTypesMap[projectId] = true;
    });
    return types;
  };

  createIssueType = async (workspaceSlug: string, projectId: string, data: Partial<TIssueType>) => {
    const type = await this.service.createIssueType(workspaceSlug, projectId, data);
    runInAction(() => {
      this.typeMap[type.id] = {
        ...type,
        project_ids: type.project_ids?.length ? type.project_ids : [projectId],
      };
    });
    return type;
  };

  updateIssueType = async (workspaceSlug: string, projectId: string, typeId: string, data: Partial<TIssueType>) => {
    const type = await this.service.updateIssueType(workspaceSlug, projectId, typeId, data);
    runInAction(() => {
      this.typeMap[type.id] = {
        ...this.typeMap[type.id],
        ...type,
        project_ids: type.project_ids?.length ? type.project_ids : [projectId],
      };
    });
    return type;
  };

  deleteIssueType = async (workspaceSlug: string, projectId: string, typeId: string) => {
    await this.service.deleteIssueType(workspaceSlug, projectId, typeId);
    runInAction(() => {
      delete this.typeMap[typeId];
      Object.keys(this.propertyMap).forEach((pid) => {
        if (this.propertyMap[pid].issue_type_id === typeId) delete this.propertyMap[pid];
      });
    });
  };

  markAsDefault = async (workspaceSlug: string, projectId: string, typeId: string) => {
    await this.service.markAsDefault(workspaceSlug, projectId, typeId);
    runInAction(() => {
      Object.values(this.typeMap).forEach((type) => {
        if (type.project_ids?.includes(projectId)) {
          this.typeMap[type.id] = { ...type, is_default: type.id === typeId };
        }
      });
    });
  };

  fetchProperties = async (workspaceSlug: string, projectId: string, typeId: string) => {
    const properties = await this.service.fetchProperties(workspaceSlug, projectId, typeId);
    runInAction(() => {
      properties.forEach((prop) => {
        this.propertyMap[prop.id] = prop;
      });
      this.fetchedPropertiesMap[typeId] = true;
    });
    return properties;
  };

  createProperty = async (
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    data: Partial<TIssueCustomProperty> & { options?: Partial<TIssueCustomPropertyOption>[] }
  ) => {
    const prop = await this.service.createProperty(workspaceSlug, projectId, typeId, data);
    runInAction(() => {
      this.propertyMap[prop.id] = prop;
    });
    return prop;
  };

  updateProperty = async (
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    propertyId: string,
    data: Partial<TIssueCustomProperty>
  ) => {
    const prop = await this.service.updateProperty(workspaceSlug, projectId, typeId, propertyId, data);
    runInAction(() => {
      this.propertyMap[prop.id] = prop;
    });
    return prop;
  };

  deleteProperty = async (workspaceSlug: string, projectId: string, typeId: string, propertyId: string) => {
    await this.service.deleteProperty(workspaceSlug, projectId, typeId, propertyId);
    runInAction(() => {
      delete this.propertyMap[propertyId];
    });
  };

  createOption = async (
    workspaceSlug: string,
    projectId: string,
    typeId: string,
    propertyId: string,
    data: Partial<TIssueCustomPropertyOption>
  ) => {
    const option = await this.service.createOption(workspaceSlug, projectId, typeId, propertyId, data);
    runInAction(() => {
      const prop = this.propertyMap[propertyId];
      if (prop) {
        this.propertyMap[propertyId] = {
          ...prop,
          options: [...(prop.options ?? []), option],
        };
      }
    });
    return option;
  };

  fetchIssuePropertyValues = async (workspaceSlug: string, projectId: string, issueId: string) => {
    const values = await this.service.fetchIssuePropertyValues(workspaceSlug, projectId, issueId);
    runInAction(() => {
      this.valueMap[issueId] = {};
      values.forEach((v) => {
        this.valueMap[issueId][v.property_id] = v;
      });
    });
    return values;
  };

  upsertIssuePropertyValues = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    payloads: TIssueCustomPropertyValueWrite[]
  ) => {
    const result = await this.service.upsertIssuePropertyValues(workspaceSlug, projectId, issueId, payloads);
    runInAction(() => {
      if (!this.valueMap[issueId]) this.valueMap[issueId] = {};
      result.values.forEach((v) => {
        this.valueMap[issueId][v.property_id] = v;
      });
    });
  };
}
