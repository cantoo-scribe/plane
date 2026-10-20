# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from uuid import uuid4

import pytest
from rest_framework import status
from rest_framework.test import APIClient

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


@pytest.mark.unit
@pytest.mark.django_db
class TestIssueFormPublicAPI:
    @pytest.fixture
    def form_setup(self, create_user):
        workspace = Workspace.objects.create(
            name="Public Form WS", slug=f"pf-{uuid4().hex[:8]}", owner=create_user
        )
        WorkspaceMember.objects.create(workspace=workspace, member=create_user, role=20)
        project = Project.objects.create(
            name="Public Form Project",
            identifier="PFP",
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
            name="Intake Type",
            is_default=True,
            is_active=True,
        )
        ProjectIssueType.objects.create(
            workspace=workspace,
            project=project,
            issue_type=issue_type,
            is_default=True,
        )
        prop = IssueCustomProperty.objects.create(
            workspace=workspace,
            issue_type=issue_type,
            name="Customer",
            property_type=IssueCustomPropertyType.TEXT,
            is_required=True,
        )
        form = IssueForm.objects.create(
            workspace=workspace,
            project=project,
            issue_type=issue_type,
            name="Feature request",
            is_active=True,
            target_state=state,
        )
        name_field = IssueFormField.objects.create(
            workspace=workspace,
            project=project,
            form=form,
            label="Title",
            target_kind=IssueFormFieldTargetKind.CORE,
            core_key=IssueFormCoreKey.NAME,
            is_required=True,
            sort_order=10000,
        )
        custom_field = IssueFormField.objects.create(
            workspace=workspace,
            project=project,
            form=form,
            label="Customer",
            target_kind=IssueFormFieldTargetKind.CUSTOM,
            custom_property=prop,
            is_required=True,
            sort_order=20000,
        )
        return form, name_field, custom_field, prop, project

    def test_get_schema(self, form_setup):
        form, _name_field, _custom_field, _prop, _project = form_setup
        client = APIClient()
        response = client.get(f"/api/public/forms/{form.anchor}/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["name"] == "Feature request"
        assert len(response.data["fields"]) == 2

    def test_get_inactive_form_404(self, form_setup):
        form, *_ = form_setup
        form.is_active = False
        form.save(update_fields=["is_active"])
        client = APIClient()
        response = client.get(f"/api/public/forms/{form.anchor}/")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_submit_creates_issue_and_values(self, form_setup):
        form, name_field, custom_field, prop, project = form_setup
        client = APIClient()
        response = client.post(
            f"/api/public/forms/{form.anchor}/submit/",
            {
                "answers": {
                    str(name_field.id): "Ship forms",
                    str(custom_field.id): {"value_text": "Acme"},
                },
                "website": "",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["name"] == "Ship forms"
        issue = Issue.objects.get(pk=response.data["id"])
        assert issue.project_id == project.id
        assert issue.type_id == form.issue_type_id
        assert IssueCustomPropertyValue.objects.filter(
            issue=issue, property=prop, value_text="Acme"
        ).exists()

    def test_submit_missing_required_400(self, form_setup):
        form, name_field, _custom_field, _prop, _project = form_setup
        client = APIClient()
        response = client.post(
            f"/api/public/forms/{form.anchor}/submit/",
            {"answers": {str(name_field.id): "Only title"}, "website": ""},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "errors" in response.data

    def test_honeypot_rejects(self, form_setup):
        form, name_field, custom_field, _prop, _project = form_setup
        client = APIClient()
        response = client.post(
            f"/api/public/forms/{form.anchor}/submit/",
            {
                "answers": {
                    str(name_field.id): "Spam",
                    str(custom_field.id): {"value_text": "Bot"},
                },
                "website": "http://spam.example",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
