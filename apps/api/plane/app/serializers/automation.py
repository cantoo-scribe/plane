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

CHANGEABLE_PROPERTIES = {"priority", "state_id", "name", "target_date", "assignee_ids"}
CREATE_WORK_ITEM_FIELD_KEYS = {
    "priority",
    "state_id",
    "assignee_ids",
    "label_ids",
    "start_date",
    "target_date",
}
SOURCE_FIELDS = {
    "name",
    "priority",
    "state_id",
    "assignee_ids",
    "label_ids",
    "start_date",
    "target_date",
}
DATE_FIELD_KEYS = {"start_date", "target_date"}
RELATIVE_DATE_UNITS = {"days", "weeks", "months"}
RELATIVE_DATE_BASES = {"now", "source.start_date", "source.target_date"}
FIELD_VALUE_MODES = {"static", "from_source", "relative_date"}


def _validate_field_value(spec, *, field_key: str | None = None, required: bool = False):
    """Validate a FieldValue spec. Plain strings/lists are accepted as legacy static values."""
    if spec is None:
        if required:
            raise serializers.ValidationError("Value is required.")
        return

    if not isinstance(spec, dict) or "mode" not in spec:
        if required and isinstance(spec, str) and not spec.strip():
            raise serializers.ValidationError("Value is required.")
        return

    mode = spec.get("mode")
    if mode not in FIELD_VALUE_MODES:
        raise serializers.ValidationError(f"Invalid mode. Must be one of: {', '.join(sorted(FIELD_VALUE_MODES))}.")

    if mode == "static":
        value = spec.get("value")
        if required and (value is None or (isinstance(value, str) and not value.strip())):
            raise serializers.ValidationError("Static value is required.")
        return

    if mode == "from_source":
        field = spec.get("field")
        if field not in SOURCE_FIELDS:
            raise serializers.ValidationError(
                f"from_source.field must be one of: {', '.join(sorted(SOURCE_FIELDS))}."
            )
        return

    if mode == "relative_date":
        if field_key and field_key not in DATE_FIELD_KEYS:
            raise serializers.ValidationError("relative_date mode is only valid for date fields.")
        base = spec.get("base") or "now"
        if base not in RELATIVE_DATE_BASES:
            raise serializers.ValidationError(
                f"relative_date.base must be one of: {', '.join(sorted(RELATIVE_DATE_BASES))}."
            )
        offset = spec.get("offset") or {}
        if not isinstance(offset, dict):
            raise serializers.ValidationError("relative_date.offset must be an object.")
        unit = offset.get("unit") or "days"
        if unit not in RELATIVE_DATE_UNITS:
            raise serializers.ValidationError(
                f"relative_date.offset.unit must be one of: {', '.join(sorted(RELATIVE_DATE_UNITS))}."
            )
        try:
            int(offset.get("amount", 0))
        except (TypeError, ValueError) as exc:
            raise serializers.ValidationError("relative_date.offset.amount must be an integer.") from exc


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
        elif action_type == WorkspaceAutomationActionType.CREATE_WORK_ITEM:
            if not config.get("project_id"):
                raise serializers.ValidationError({"config": "project_id is required for create_work_item."})
            try:
                _validate_field_value(config.get("name"), field_key="name", required=True)
            except serializers.ValidationError as exc:
                detail = exc.detail[0] if isinstance(exc.detail, list) else exc.detail
                raise serializers.ValidationError({"config": f"name: {detail}"}) from exc

            fields = config.get("fields") or {}
            if not isinstance(fields, dict):
                raise serializers.ValidationError({"config": "fields must be an object."})
            for field_key, field_spec in fields.items():
                if field_key not in CREATE_WORK_ITEM_FIELD_KEYS:
                    raise serializers.ValidationError(
                        {
                            "config": (
                                f"Unsupported create field '{field_key}'. "
                                f"Allowed: {', '.join(sorted(CREATE_WORK_ITEM_FIELD_KEYS))}."
                            )
                        }
                    )
                try:
                    _validate_field_value(field_spec, field_key=field_key, required=False)
                except serializers.ValidationError as exc:
                    detail = exc.detail[0] if isinstance(exc.detail, list) else exc.detail
                    raise serializers.ValidationError({"config": f"fields.{field_key}: {detail}"}) from exc
        elif action_type == WorkspaceAutomationActionType.CHANGE_PROPERTY:
            property_key = config.get("property")
            if property_key not in CHANGEABLE_PROPERTIES:
                raise serializers.ValidationError(
                    {"config": f"property must be one of: {', '.join(sorted(CHANGEABLE_PROPERTIES))}."}
                )
            if "value" not in config:
                raise serializers.ValidationError({"config": "value is required for change_property."})
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
        # Keep at most one project id (single-project filter or all)
        cleaned = [str(project_id) for project_id in value if project_id]
        return cleaned[:1]

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
