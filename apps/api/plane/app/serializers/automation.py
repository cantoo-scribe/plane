# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import DynamicBaseSerializer
from plane.db.models import (
    WorkspaceAutomation,
    WorkspaceAutomationAction,
    WorkspaceAutomationCondition,
    WorkspaceAutomationRun,
)
from plane.db.models.automation import (
    WorkspaceAutomationActionType,
    WorkspaceAutomationConditionField,
    WorkspaceAutomationConditionOperator,
    WorkspaceAutomationTriggerType,
)


class WorkspaceAutomationConditionSerializer(DynamicBaseSerializer):
    class Meta:
        model = WorkspaceAutomationCondition
        fields = ("id", "field", "operator", "value", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_field(self, value):
        if value not in WorkspaceAutomationConditionField.values:
            raise serializers.ValidationError("Invalid condition field.")
        return value

    def validate_operator(self, value):
        if value not in WorkspaceAutomationConditionOperator.values:
            raise serializers.ValidationError("Invalid condition operator.")
        return value


class WorkspaceAutomationActionSerializer(DynamicBaseSerializer):
    class Meta:
        model = WorkspaceAutomationAction
        fields = ("id", "action_type", "config", "sequence", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_action_type(self, value):
        if value not in WorkspaceAutomationActionType.values:
            raise serializers.ValidationError("Invalid action type.")
        return value

    def validate(self, attrs):
        action_type = attrs.get("action_type") or getattr(self.instance, "action_type", None)
        config = attrs.get("config", getattr(self.instance, "config", {}) if self.instance else {})
        if not isinstance(config, dict):
            raise serializers.ValidationError({"config": "Config must be an object."})

        if action_type == WorkspaceAutomationActionType.CHANGE_STATE:
            if not config.get("state_id"):
                raise serializers.ValidationError({"config": "state_id is required for change_state."})
        elif action_type == WorkspaceAutomationActionType.ASSIGN:
            assignee_ids = config.get("assignee_ids")
            if not isinstance(assignee_ids, list) or not assignee_ids:
                raise serializers.ValidationError({"config": "assignee_ids must be a non-empty list for assign."})
        elif action_type == WorkspaceAutomationActionType.ADD_COMMENT:
            if not config.get("comment_html"):
                raise serializers.ValidationError({"config": "comment_html is required for add_comment."})
        return attrs


class WorkspaceAutomationSerializer(DynamicBaseSerializer):
    conditions = WorkspaceAutomationConditionSerializer(many=True, required=False)
    actions = WorkspaceAutomationActionSerializer(many=True, required=False)

    class Meta:
        model = WorkspaceAutomation
        fields = (
            "id",
            "name",
            "is_active",
            "trigger_type",
            "trigger_config",
            "project_ids",
            "conditions",
            "actions",
            "created_at",
            "updated_at",
            "created_by",
        )
        read_only_fields = ("id", "created_at", "updated_at", "created_by")

    def validate_trigger_type(self, value):
        if value not in WorkspaceAutomationTriggerType.values:
            raise serializers.ValidationError("Invalid trigger type.")
        return value

    def validate_project_ids(self, value):
        if value is None:
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError("project_ids must be a list.")
        return [str(project_id) for project_id in value]

    def validate_trigger_config(self, value):
        if value is None:
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError("trigger_config must be an object.")
        return value

    def create(self, validated_data):
        conditions_data = validated_data.pop("conditions", [])
        actions_data = validated_data.pop("actions", [])
        automation = WorkspaceAutomation.objects.create(**validated_data)

        for condition_data in conditions_data:
            WorkspaceAutomationCondition.objects.create(automation=automation, **condition_data)

        for index, action_data in enumerate(actions_data):
            payload = {**action_data}
            payload.setdefault("sequence", index)
            WorkspaceAutomationAction.objects.create(automation=automation, **payload)

        return automation

    def update(self, instance, validated_data):
        conditions_data = validated_data.pop("conditions", None)
        actions_data = validated_data.pop("actions", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if conditions_data is not None:
            instance.conditions.all().delete()
            for condition_data in conditions_data:
                WorkspaceAutomationCondition.objects.create(automation=instance, **condition_data)

        if actions_data is not None:
            instance.actions.all().delete()
            for index, action_data in enumerate(actions_data):
                payload = {**action_data}
                payload.setdefault("sequence", index)
                WorkspaceAutomationAction.objects.create(automation=instance, **payload)

        return instance


class WorkspaceAutomationRunSerializer(DynamicBaseSerializer):
    class Meta:
        model = WorkspaceAutomationRun
        fields = (
            "id",
            "automation",
            "issue",
            "status",
            "error",
            "actor",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields
