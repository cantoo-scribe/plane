# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework import status

from plane.db.models import WorkspaceAutomation, WorkspaceAutomationAction, WorkspaceAutomationCondition
from plane.db.models.automation import (
    WorkspaceAutomationActionType,
    WorkspaceAutomationConditionField,
    WorkspaceAutomationConditionOperator,
    WorkspaceAutomationTriggerType,
)


def _automations_url(slug, pk=None):
    base = f"/api/workspaces/{slug}/automations/"
    if pk:
        return f"{base}{pk}/"
    return base


@pytest.mark.contract
class TestWorkspaceAutomationsAPI:
    @pytest.mark.django_db
    def test_create_list_retrieve_update_delete(self, session_client, workspace):
        payload = {
            "name": "Assign on create",
            "trigger_type": WorkspaceAutomationTriggerType.ISSUE_CREATED,
            "trigger_config": {},
            "project_ids": [],
            "is_active": True,
            "conditions": [
                {
                    "field": WorkspaceAutomationConditionField.PRIORITY,
                    "operator": WorkspaceAutomationConditionOperator.IS,
                    "value": "urgent",
                }
            ],
            "actions": [
                {
                    "action_type": WorkspaceAutomationActionType.ADD_COMMENT,
                    "config": {"comment_html": "<p>Urgent item created</p>"},
                    "sequence": 0,
                }
            ],
        }

        create_response = session_client.post(_automations_url(workspace.slug), payload, format="json")
        assert create_response.status_code == status.HTTP_201_CREATED
        body = create_response.json()
        assert body["name"] == "Assign on create"
        assert body["trigger_type"] == WorkspaceAutomationTriggerType.ISSUE_CREATED
        assert len(body["conditions"]) == 1
        assert len(body["actions"]) == 1
        automation_id = body["id"]

        list_response = session_client.get(_automations_url(workspace.slug))
        assert list_response.status_code == status.HTTP_200_OK
        assert any(item["id"] == automation_id for item in list_response.json())

        retrieve_response = session_client.get(_automations_url(workspace.slug, pk=automation_id))
        assert retrieve_response.status_code == status.HTTP_200_OK
        assert retrieve_response.json()["id"] == automation_id

        patch_response = session_client.patch(
            _automations_url(workspace.slug, pk=automation_id),
            {"name": "Renamed", "is_active": False},
            format="json",
        )
        assert patch_response.status_code == status.HTTP_200_OK
        assert patch_response.json()["name"] == "Renamed"
        assert patch_response.json()["is_active"] is False

        delete_response = session_client.delete(_automations_url(workspace.slug, pk=automation_id))
        assert delete_response.status_code == status.HTTP_204_NO_CONTENT
        assert not WorkspaceAutomation.objects.filter(pk=automation_id).exists()

    @pytest.mark.django_db
    def test_rejects_invalid_trigger(self, session_client, workspace):
        response = session_client.post(
            _automations_url(workspace.slug),
            {
                "name": "Bad",
                "trigger_type": "not_a_trigger",
                "actions": [
                    {
                        "action_type": WorkspaceAutomationActionType.ADD_COMMENT,
                        "config": {"comment_html": "<p>x</p>"},
                    }
                ],
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_rejects_incomplete_action_config(self, session_client, workspace):
        response = session_client.post(
            _automations_url(workspace.slug),
            {
                "name": "Bad action",
                "trigger_type": WorkspaceAutomationTriggerType.STATE_CHANGED,
                "actions": [
                    {
                        "action_type": WorkspaceAutomationActionType.CHANGE_STATE,
                        "config": {},
                    }
                ],
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_replace_conditions_and_actions_on_patch(self, session_client, workspace):
        automation = WorkspaceAutomation.objects.create(
            workspace=workspace,
            name="Original",
            trigger_type=WorkspaceAutomationTriggerType.ASSIGNEE_CHANGED,
        )
        WorkspaceAutomationCondition.objects.create(
            automation=automation,
            field=WorkspaceAutomationConditionField.PRIORITY,
            operator=WorkspaceAutomationConditionOperator.IS,
            value="high",
        )
        WorkspaceAutomationAction.objects.create(
            automation=automation,
            action_type=WorkspaceAutomationActionType.ADD_COMMENT,
            config={"comment_html": "<p>old</p>"},
            sequence=0,
        )

        response = session_client.patch(
            _automations_url(workspace.slug, pk=automation.id),
            {
                "conditions": [
                    {
                        "field": WorkspaceAutomationConditionField.STATE,
                        "operator": WorkspaceAutomationConditionOperator.IS,
                        "value": "00000000-0000-0000-0000-000000000001",
                    }
                ],
                "actions": [
                    {
                        "action_type": WorkspaceAutomationActionType.ASSIGN,
                        "config": {"assignee_ids": ["00000000-0000-0000-0000-000000000002"]},
                        "sequence": 0,
                    }
                ],
            },
            format="json",
        )

        assert response.status_code == status.HTTP_200_OK
        body = response.json()
        assert len(body["conditions"]) == 1
        assert body["conditions"][0]["field"] == WorkspaceAutomationConditionField.STATE
        assert len(body["actions"]) == 1
        assert body["actions"][0]["action_type"] == WorkspaceAutomationActionType.ASSIGN
        assert WorkspaceAutomationCondition.objects.filter(automation=automation).count() == 1
        assert WorkspaceAutomationAction.objects.filter(automation=automation).count() == 1
