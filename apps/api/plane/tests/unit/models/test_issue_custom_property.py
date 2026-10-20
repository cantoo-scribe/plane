# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from uuid import uuid4

import pytest

from plane.utils.issue_custom_property_values import evaluate_formula
from plane.db.models import (
    Issue,
    IssueCustomProperty,
    IssueCustomPropertyOption,
    IssueCustomPropertyType,
    IssueCustomPropertyValue,
    IssueType,
    Project,
    ProjectIssueType,
    ProjectMember,
    State,
    Workspace,
    WorkspaceMember,
)


@pytest.mark.unit
class TestEvaluateFormula:
    def test_numeric_formula(self):
        result = evaluate_formula("{A} + {B} * 2", {"A": 3, "B": 4})
        assert result == 11

    def test_missing_reference(self):
        with pytest.raises(ValueError, match="non-existent"):
            evaluate_formula("{Missing}", {"A": 1})

    def test_empty_expression(self):
        with pytest.raises(ValueError, match="required"):
            evaluate_formula("", {"A": 1})


@pytest.mark.unit
@pytest.mark.django_db
class TestIssueTypeAndCustomPropertyModels:
    @pytest.fixture
    def project_setup(self, create_user):
        workspace = Workspace.objects.create(
            name="CP Workspace", slug=f"cp-{uuid4().hex[:8]}", owner=create_user
        )
        WorkspaceMember.objects.create(workspace=workspace, member=create_user, role=20)
        project = Project.objects.create(
            name="CP Project",
            identifier="CP",
            workspace=workspace,
            created_by=create_user,
            is_issue_type_enabled=True,
        )
        ProjectMember.objects.create(project=project, member=create_user, role=20, is_active=True)
        state = State.objects.create(
            name="Todo", project=project, workspace=workspace, group="backlog", default=True
        )
        issue_type = IssueType.objects.create(
            workspace=workspace,
            name="Bug",
            is_default=True,
            is_active=True,
        )
        ProjectIssueType.objects.create(
            workspace=workspace,
            project=project,
            issue_type=issue_type,
            is_default=True,
        )
        issue = Issue.objects.create(
            name="Custom prop issue",
            project=project,
            workspace=workspace,
            state=state,
            type=issue_type,
            created_by=create_user,
        )
        return workspace, project, issue_type, issue, create_user

    def test_create_property_and_value(self, project_setup):
        workspace, project, issue_type, issue, _user = project_setup
        prop = IssueCustomProperty.objects.create(
            workspace=workspace,
            issue_type=issue_type,
            name="Severity",
            property_type=IssueCustomPropertyType.DROPDOWN,
        )
        option = IssueCustomPropertyOption.objects.create(
            workspace=workspace,
            property=prop,
            name="High",
            is_default=True,
        )
        value = IssueCustomPropertyValue.objects.create(
            workspace=workspace,
            project=project,
            issue=issue,
            property=prop,
        )
        value.value_options.add(option)
        assert value.value_options.count() == 1
        assert prop.options.count() == 1

    def test_unique_property_name_per_type(self, project_setup):
        workspace, _project, issue_type, _issue, _user = project_setup
        IssueCustomProperty.objects.create(
            workspace=workspace,
            issue_type=issue_type,
            name="Score",
            property_type=IssueCustomPropertyType.NUMBER,
        )
        from django.db import IntegrityError

        with pytest.raises(IntegrityError):
            IssueCustomProperty.objects.create(
                workspace=workspace,
                issue_type=issue_type,
                name="Score",
                property_type=IssueCustomPropertyType.NUMBER,
            )
