# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import (
    IssueCustomProperty,
    IssueCustomPropertyOption,
    IssueCustomPropertyType,
    IssueCustomPropertyValue,
)


class IssueCustomPropertyOptionSerializer(BaseSerializer):
    class Meta:
        model = IssueCustomPropertyOption
        fields = [
            "id",
            "workspace_id",
            "property_id",
            "name",
            "description",
            "sort_order",
            "is_active",
            "logo_props",
            "is_default",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["workspace", "property"]


class IssueCustomPropertySerializer(BaseSerializer):
    options = IssueCustomPropertyOptionSerializer(many=True, read_only=True)

    class Meta:
        model = IssueCustomProperty
        fields = [
            "id",
            "workspace_id",
            "issue_type_id",
            "name",
            "description",
            "property_type",
            "is_required",
            "is_active",
            "settings",
            "default_value",
            "sort_order",
            "logo_props",
            "options",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["workspace", "issue_type"]

    def validate_property_type(self, value):
        valid = {choice.value for choice in IssueCustomPropertyType}
        if value not in valid:
            raise serializers.ValidationError(f"Invalid property type. Must be one of: {', '.join(sorted(valid))}")
        return value

    def validate_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("You must name your property.")
        if len(value) > 255:
            raise serializers.ValidationError("Property name should not exceed 255 characters.")
        return value.strip()


class IssueCustomPropertyValueSerializer(BaseSerializer):
    value_option_ids = serializers.SerializerMethodField()
    value_member_ids = serializers.SerializerMethodField()
    property_id = serializers.UUIDField()

    class Meta:
        model = IssueCustomPropertyValue
        fields = [
            "id",
            "workspace_id",
            "project_id",
            "issue_id",
            "property_id",
            "value_text",
            "value_number",
            "value_boolean",
            "value_datetime",
            "value_option_ids",
            "value_member_ids",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["workspace", "project", "issue"]

    def get_value_option_ids(self, obj):
        return [str(option_id) for option_id in obj.value_options.values_list("id", flat=True)]

    def get_value_member_ids(self, obj):
        return [str(member_id) for member_id in obj.value_members.values_list("id", flat=True)]


class IssueCustomPropertyValueWriteSerializer(serializers.Serializer):
    """Payload for creating/updating a single property value on an issue."""

    property_id = serializers.UUIDField()
    value_text = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    value_number = serializers.FloatField(required=False, allow_null=True)
    value_boolean = serializers.BooleanField(required=False, allow_null=True)
    value_datetime = serializers.DateTimeField(required=False, allow_null=True)
    value_option_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        allow_empty=True,
    )
    value_member_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        allow_empty=True,
    )
