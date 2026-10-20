# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from .issue_custom_property import IssueCustomPropertyOptionSerializer, IssueCustomPropertySerializer
from plane.db.models import (
    IssueForm,
    IssueFormCoreKey,
    IssueFormField,
    IssueFormFieldTargetKind,
)


class IssueFormFieldSerializer(BaseSerializer):
    custom_property_id = serializers.UUIDField(required=False, allow_null=True)
    custom_property = IssueCustomPropertySerializer(read_only=True)

    class Meta:
        model = IssueFormField
        fields = [
            "id",
            "workspace_id",
            "project_id",
            "form_id",
            "sort_order",
            "label",
            "help_text",
            "is_required",
            "is_visible",
            "target_kind",
            "core_key",
            "custom_property_id",
            "custom_property",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["workspace", "project", "form"]

    def validate(self, attrs):
        target_kind = attrs.get("target_kind", getattr(self.instance, "target_kind", None))
        core_key = attrs.get("core_key", getattr(self.instance, "core_key", None))
        custom_property_id = attrs.get(
            "custom_property_id",
            getattr(self.instance, "custom_property_id", None) if self.instance else None,
        )

        if target_kind == IssueFormFieldTargetKind.CORE:
            if not core_key:
                raise serializers.ValidationError({"core_key": "core_key is required for CORE fields"})
            if core_key not in {c.value for c in IssueFormCoreKey}:
                raise serializers.ValidationError({"core_key": "Invalid core_key"})
            if custom_property_id:
                raise serializers.ValidationError(
                    {"custom_property_id": "custom_property_id must be empty for CORE fields"}
                )
            attrs["custom_property_id"] = None
        elif target_kind == IssueFormFieldTargetKind.CUSTOM:
            if not custom_property_id:
                raise serializers.ValidationError(
                    {"custom_property_id": "custom_property_id is required for CUSTOM fields"}
                )
            if core_key:
                raise serializers.ValidationError({"core_key": "core_key must be empty for CUSTOM fields"})
            attrs["core_key"] = None
        else:
            raise serializers.ValidationError({"target_kind": "Invalid target_kind"})

        return attrs


class IssueFormSerializer(BaseSerializer):
    form_fields = IssueFormFieldSerializer(source="fields", many=True, read_only=True)
    issue_type_id = serializers.UUIDField()
    target_state_id = serializers.UUIDField(required=False, allow_null=True)
    public_url_path = serializers.SerializerMethodField()

    class Meta:
        model = IssueForm
        fields = [
            "id",
            "workspace_id",
            "project_id",
            "issue_type_id",
            "name",
            "description",
            "logo_props",
            "is_active",
            "anchor",
            "target_state_id",
            "form_fields",
            "public_url_path",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["workspace", "project", "anchor"]

    def get_public_url_path(self, obj):
        return f"/forms/{obj.anchor}"

    def validate_name(self, value):
        if not value or not str(value).strip():
            raise serializers.ValidationError("Name is required")
        return str(value).strip()


class IssueFormPublicFieldSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    sort_order = serializers.FloatField()
    label = serializers.CharField()
    help_text = serializers.CharField()
    is_required = serializers.BooleanField()
    target_kind = serializers.CharField()
    core_key = serializers.CharField(allow_null=True)
    custom_property_id = serializers.UUIDField(allow_null=True)
    property_type = serializers.CharField(allow_null=True)
    settings = serializers.JSONField(allow_null=True)
    options = IssueCustomPropertyOptionSerializer(many=True, required=False)


class IssueFormPublicSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    description = serializers.CharField()
    logo_props = serializers.JSONField()
    issue_type_id = serializers.UUIDField()
    fields = IssueFormPublicFieldSerializer(many=True)


class IssueFormSubmitSerializer(serializers.Serializer):
    """Payload for a public form submission."""

    # Honeypot — must be empty / absent
    website = serializers.CharField(required=False, allow_blank=True, default="")
    answers = serializers.DictField(child=serializers.JSONField(), required=True)

    def validate_website(self, value):
        if value:
            raise serializers.ValidationError("Invalid submission")
        return value
