# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.utils.filters.custom_property_filter_backend import CUSTOM_PROPERTY_KEY_RE, IssueFilterBackend


@pytest.mark.unit
class TestCustomPropertyFilterKey:
    def test_matches_property_id(self):
        match = CUSTOM_PROPERTY_KEY_RE.match("customproperty_12345678-1234-1234-1234-123456789abc")
        assert match is not None
        assert match.group("property_id") == "12345678-1234-1234-1234-123456789abc"
        assert match.group("lookup") is None

    def test_matches_with_lookup(self):
        match = CUSTOM_PROPERTY_KEY_RE.match(
            "customproperty_12345678-1234-1234-1234-123456789abc__icontains"
        )
        assert match is not None
        assert match.group("lookup") == "icontains"

    def test_transform_for_validation(self):
        backend = IssueFilterBackend()
        assert (
            backend._transform_field_name_for_validation(
                "customproperty_12345678-1234-1234-1234-123456789abc"
            )
            == "project_id"
        )
        assert backend._transform_field_name_for_validation("state_id") == "state_id"
