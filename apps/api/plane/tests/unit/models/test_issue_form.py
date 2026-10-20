# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from uuid import uuid4

import pytest
from django.core.exceptions import ValidationError

from plane.db.models import (
    Issue,
    IssueCustomProperty,
    IssueCustomPropertyType,
    IssueCustomPropertyValue,
    IssueForm,
    IssueFormCoreKey,
    IssueFormField,
    IssueFormFieldTargetKind,
    IssueType,
    Project,
    ProjectIssueType,
    ProjectMember,
    State,
    Workspace,
    WorkspaceMember,
)
from plane.utils.issue_custom_property_values import upsert_property_values


@pytest.mark.unit
@pytest.mark.django_db
class TestIssueFormModels:
    @pytest.fixture
    def project_setup(self, create_user):
        workspace = Workspace.objects.create(
            name="Form Workspace", slug=f"form-{uuid4().hex[:8]}", owner=create_user
        )
        WorkspaceMember.objects.create(workspace=workspace, member=create_user, role=20)
        project = Project.objects.create(
            name="Form Project",
            identifier="FRM",
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
            name="Request",
            is_default=True,
            is_active=True,
        )
        ProjectIssueType.objects.create(
            workspace=workspace,
            project=project,
            issue_type=issue_type,
            is_default=True,
        )
        return workspace, project, issue_type, state, create_user

    def test_create_form_with_core_and_custom_fields(self, project_setup):
        workspace, project, issue_type, _state, _user = project_setup
        form = IssueForm.objects.create(
            workspace=workspace,
            project=project,
            issue_type=issue_type,
            name="Bug report",
        )
        assert form.anchor
        assert form.is_active

        name_field = IssueFormField.objects.create(
            workspace=workspace,
            project=project,
            form=form,
            label="Title",
            target_kind=IssueFormFieldTargetKind.CORE,
            core_key=IssueFormCoreKey.NAME,
            is_required=True,
        )
        prop = IssueCustomProperty.objects.create(
            workspace=workspace,
            issue_type=issue_type,
            name="Severity",
            property_type=IssueCustomPropertyType.TEXT,
        )
        custom_field = IssueFormField.objects.create(
            workspace=workspace,
            project=project,
            form=form,
            label="Severity",
            target_kind=IssueFormFieldTargetKind.CUSTOM,
            custom_property=prop,
        )

        assert name_field.core_key == "name"
        assert custom_field.custom_property_id == prop.id

        name_field.clean()
        custom_field.clean()

    def test_field_clean_rejects_invalid_mapping(self, project_setup):
        workspace, project, issue_type, _state, _user = project_setup
        form = IssueForm.objects.create(
            workspace=workspace,
            project=project,
            issue_type=issue_type,
            name="Invalid mapping form",
        )
        field = IssueFormField(
            workspace=workspace,
            project=project,
            form=form,
            label="Broken",
            target_kind=IssueFormFieldTargetKind.CORE,
            core_key=None,
        )
        with pytest.raises(ValidationError):
            field.clean()

    def test_renew_anchor(self, project_setup):
        workspace, project, issue_type, _state, _user = project_setup
        form = IssueForm.objects.create(
            workspace=workspace,
            project=project,
            issue_type=issue_type,
            name="Renewable",
        )
        old = form.anchor
        new = form.renew_anchor()
        assert new != old
        form.refresh_from_db()
        assert form.anchor == new

    def test_upsert_values_from_form_submission(self, project_setup):
        workspace, project, issue_type, state, user = project_setup
        prop = IssueCustomProperty.objects.create(
            workspace=workspace,
            issue_type=issue_type,
            name="Notes",
            property_type=IssueCustomPropertyType.TEXT,
            is_required=True,
        )
        issue = Issue.objects.create(
            name="From form",
            project=project,
            workspace=workspace,
            state=state,
            type=issue_type,
            created_by=user,
        )
        results, errors = upsert_property_values(
            issue,
            project,
            [{"property_id": prop.id, "value_text": "Hello"}],
            issue_type_id=issue_type.id,
        )
        assert not errors
        assert len(results) == 1
        assert IssueCustomPropertyValue.objects.filter(issue=issue, property=prop).exists()

        _, required_errors = upsert_property_values(
            issue,
            project,
            [{"property_id": prop.id, "value_text": ""}],
            issue_type_id=issue_type.id,
        )
        assert str(prop.id) in required_errors
