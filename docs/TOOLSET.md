# Toolset

## Overview

| Functional Area   | Tool                                                                                                      | Description                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Advanced Security | [mcp_ado_advsec_get_alerts](#mcp_ado_advsec_get_alerts)                                                   | Retrieve Advanced Security alerts for a repository                |
| Advanced Security | [mcp_ado_advsec_get_alert_details](#mcp_ado_advsec_get_alert_details)                                     | Get detailed information about a specific security alert          |
| Core              | [mcp_ado_core_list_projects](#mcp_ado_core_list_projects)                                                 | List all projects in the organization                             |
| Core              | [mcp_ado_core_list_project_teams](#mcp_ado_core_list_project_teams)                                       | List teams within a project                                       |
| Core              | [mcp_ado_core_get_identity_ids](#mcp_ado_core_get_identity_ids)                                           | Retrieve identity IDs by search filter                            |
| Core              | [mcp_ado_core_create_project](#mcp_ado_core_create_project)                                               | Create a new project in the organization                          |
| Core              | [mcp_ado_core_update_project](#mcp_ado_core_update_project)                                               | Update an existing project                                        |
| Core              | [mcp_ado_core_delete_project](#mcp_ado_core_delete_project)                                               | Delete a project from the organization                            |
| Core              | [mcp_ado_core_create_team](#mcp_ado_core_create_team)                                                     | Create a new team in a project                                    |
| Core              | [mcp_ado_core_update_team](#mcp_ado_core_update_team)                                                     | Update an existing team in a project                              |
| Core              | [mcp_ado_core_delete_team](#mcp_ado_core_delete_team)                                                     | Delete a team from a project                                      |
| Core              | [mcp_ado_core_list_processes](#mcp_ado_core_list_processes)                                               | List organization process templates                               |
| Core              | [mcp_ado_core_list_team_members](#mcp_ado_core_list_team_members)                                         | List members of a team                                            |
| Core              | [mcp_ado_core_get_project_properties](#mcp_ado_core_get_project_properties)                               | Get project properties                                            |
| Core              | [mcp_ado_core_set_project_properties](#mcp_ado_core_set_project_properties)                               | Set project properties                                            |
| Pipelines         | [mcp_ado_pipelines_create_pipeline](#mcp_ado_pipelines_create_pipeline)                                   | Create a new pipeline with YAML configuration                     |
| Pipelines         | [mcp_ado_pipelines_get_builds](#mcp_ado_pipelines_get_builds)                                             | Retrieve a list of builds with optional filters                   |
| Pipelines         | [mcp_ado_pipelines_get_build_status](#mcp_ado_pipelines_get_build_status)                                 | Get the status of a specific build                                |
| Pipelines         | [mcp_ado_pipelines_get_build_log](#mcp_ado_pipelines_get_build_log)                                       | Retrieve complete logs for a build                                |
| Pipelines         | [mcp_ado_pipelines_get_build_log_by_id](#mcp_ado_pipelines_get_build_log_by_id)                           | Get a specific build log by log ID                                |
| Pipelines         | [mcp_ado_pipelines_get_build_changes](#mcp_ado_pipelines_get_build_changes)                               | Get changes (commits) associated with a build                     |
| Pipelines         | [mcp_ado_pipelines_get_build_definitions](#mcp_ado_pipelines_get_build_definitions)                       | List build/pipeline definitions in a project                      |
| Pipelines         | [mcp_ado_pipelines_get_build_definition_revisions](#mcp_ado_pipelines_get_build_definition_revisions)     | Get revision history of a build definition                        |
| Pipelines         | [mcp_ado_pipelines_run_pipeline](#mcp_ado_pipelines_run_pipeline)                                         | Start a new pipeline run with optional parameters                 |
| Pipelines         | [mcp_ado_pipelines_get_run](#mcp_ado_pipelines_get_run)                                                   | Get details of a specific pipeline run                            |
| Pipelines         | [mcp_ado_pipelines_list_runs](#mcp_ado_pipelines_list_runs)                                               | List recent runs for a pipeline                                   |
| Pipelines         | [mcp_ado_pipelines_update_build_stage](#mcp_ado_pipelines_update_build_stage)                             | Update a build stage (cancel, retry, or run)                      |
| Repositories      | [mcp_ado_repo_list_repos_by_project](#mcp_ado_repo_list_repos_by_project)                                 | List all repositories in a project                                |
| Repositories      | [mcp_ado_repo_get_repo_by_name_or_id](#mcp_ado_repo_get_repo_by_name_or_id)                               | Get repository details by name or ID                              |
| Repositories      | [mcp_ado_repo_list_branches_by_repo](#mcp_ado_repo_list_branches_by_repo)                                 | List all branches in a repository                                 |
| Repositories      | [mcp_ado_repo_list_my_branches_by_repo](#mcp_ado_repo_list_my_branches_by_repo)                           | List branches created by current user                             |
| Repositories      | [mcp_ado_repo_get_branch_by_name](#mcp_ado_repo_get_branch_by_name)                                       | Get details of a specific branch                                  |
| Repositories      | [mcp_ado_repo_create_branch](#mcp_ado_repo_create_branch)                                                 | Create a new branch from a source branch                          |
| Repositories      | [mcp_ado_repo_search_commits](#mcp_ado_repo_search_commits)                                               | Search for commits with comprehensive filters                     |
| Repositories      | [mcp_ado_repo_list_pull_requests_by_repo_or_project](#mcp_ado_repo_list_pull_requests_by_repo_or_project) | List pull requests with optional filters                          |
| Repositories      | [mcp_ado_repo_list_pull_requests_by_commits](#mcp_ado_repo_list_pull_requests_by_commits)                 | Find pull requests containing specific commits                    |
| Repositories      | [mcp_ado_repo_get_pull_request_by_id](#mcp_ado_repo_get_pull_request_by_id)                               | Get details of a specific pull request                            |
| Repositories      | [mcp_ado_repo_get_pull_request_changes](#mcp_ado_repo_get_pull_request_changes)                           | Get file changes (diff) for a pull request                        |
| Repositories      | [mcp_ado_repo_create_pull_request](#mcp_ado_repo_create_pull_request)                                     | Create a new pull request                                         |
| Repositories      | [mcp_ado_repo_update_pull_request](#mcp_ado_repo_update_pull_request)                                     | Update pull request properties and settings                       |
| Repositories      | [mcp_ado_repo_update_pull_request_reviewers](#mcp_ado_repo_update_pull_request_reviewers)                 | Add or remove reviewers from a pull request                       |
| Repositories      | [mcp_ado_repo_vote_pull_request](#mcp_ado_repo_vote_pull_request)                                         | Cast a vote on a pull request                                     |
| Repositories      | [mcp_ado_repo_list_pull_request_threads](#mcp_ado_repo_list_pull_request_threads)                         | List comment threads on a pull request                            |
| Repositories      | [mcp_ado_repo_list_pull_request_thread_comments](#mcp_ado_repo_list_pull_request_thread_comments)         | List comments in a specific thread                                |
| Repositories      | [mcp_ado_repo_create_pull_request_thread](#mcp_ado_repo_create_pull_request_thread)                       | Create a new comment thread on a pull request                     |
| Repositories      | [mcp_ado_repo_update_pull_request_thread](#mcp_ado_repo_update_pull_request_thread)                       | Update an existing pull request comment thread                    |
| Repositories      | [mcp_ado_repo_reply_to_comment](#mcp_ado_repo_reply_to_comment)                                           | Reply to a pull request comment                                   |
| Repositories      | [mcp_ado_repo_list_directory](#mcp_ado_repo_list_directory)                                               | List files and folders in a directory                             |
| Repositories      | [mcp_ado_repo_get_file_content](#mcp_ado_repo_get_file_content)                                           | Get file content at a specific version                            |
| Search            | [mcp_ado_search_code](#mcp_ado_search_code)                                                               | Search for code across repositories                               |
| Search            | [mcp_ado_search_wiki](#mcp_ado_search_wiki)                                                               | Search wiki pages by keywords                                     |
| Search            | [mcp_ado_search_workitem](#mcp_ado_search_workitem)                                                       | Search work items by text and filters                             |
| Test Plans        | [mcp_ado_testplan_list_test_plans](#mcp_ado_testplan_list_test_plans)                                     | List test plans in a project                                      |
| Test Plans        | [mcp_ado_testplan_create_test_plan](#mcp_ado_testplan_create_test_plan)                                   | Create a new test plan                                            |
| Test Plans        | [mcp_ado_testplan_list_test_suites](#mcp_ado_testplan_list_test_suites)                                   | List test suites in a test plan                                   |
| Test Plans        | [mcp_ado_testplan_create_test_suite](#mcp_ado_testplan_create_test_suite)                                 | Create a test suite within a test plan                            |
| Test Plans        | [mcp_ado_testplan_add_test_cases_to_suite](#mcp_ado_testplan_add_test_cases_to_suite)                     | Add test cases to a test suite                                    |
| Test Plans        | [mcp_ado_testplan_list_test_cases](#mcp_ado_testplan_list_test_cases)                                     | List test cases in a test suite                                   |
| Test Plans        | [mcp_ado_testplan_create_test_case](#mcp_ado_testplan_create_test_case)                                   | Create a new test case work item                                  |
| Test Plans        | [mcp_ado_testplan_update_test_case_steps](#mcp_ado_testplan_update_test_case_steps)                       | Update steps of an existing test case                             |
| Test Plans        | [mcp_ado_testplan_show_test_results_from_build_id](#mcp_ado_testplan_show_test_results_from_build_id)     | Get test results for a specific build                             |
| Wiki              | [mcp_ado_wiki_list_wikis](#mcp_ado_wiki_list_wikis)                                                       | List wikis in organization or project                             |
| Wiki              | [mcp_ado_wiki_get_wiki](#mcp_ado_wiki_get_wiki)                                                           | Get details of a specific wiki                                    |
| Wiki              | [mcp_ado_wiki_list_pages](#mcp_ado_wiki_list_pages)                                                       | List pages in a wiki                                              |
| Wiki              | [mcp_ado_wiki_get_page](#mcp_ado_wiki_get_page)                                                           | Get wiki page metadata (without content)                          |
| Wiki              | [mcp_ado_wiki_get_page_content](#mcp_ado_wiki_get_page_content)                                           | Retrieve wiki page content                                        |
| Wiki              | [mcp_ado_wiki_create_or_update_page](#mcp_ado_wiki_create_or_update_page)                                 | Create or update a wiki page                                      |
| Work Items        | [mcp_ado_wit_get_work_item](#mcp_ado_wit_get_work_item)                                                   | Get a work item by ID                                             |
| Work Items        | [mcp_ado_wit_get_work_items_batch_by_ids](#mcp_ado_wit_get_work_items_batch_by_ids)                       | Retrieve multiple work items by IDs                               |
| Work Items        | [mcp_ado_wit_create_work_item](#mcp_ado_wit_create_work_item)                                             | Create a new work item                                            |
| Work Items        | [mcp_ado_wit_update_work_item](#mcp_ado_wit_update_work_item)                                             | Update fields of a work item                                      |
| Work Items        | [mcp_ado_wit_update_work_items_batch](#mcp_ado_wit_update_work_items_batch)                               | Update multiple work items in batch                               |
| Work Items        | [mcp_ado_wit_add_child_work_items](#mcp_ado_wit_add_child_work_items)                                     | Create child work items under a parent                            |
| Work Items        | [mcp_ado_wit_work_items_link](#mcp_ado_wit_work_items_link)                                               | Link work items together                                          |
| Work Items        | [mcp_ado_wit_work_item_unlink](#mcp_ado_wit_work_item_unlink)                                             | Remove links from a work item                                     |
| Work Items        | [mcp_ado_wit_add_artifact_link](#mcp_ado_wit_add_artifact_link)                                           | Link artifacts (commits, builds, PRs) to work items               |
| Work Items        | [mcp_ado_wit_link_work_item_to_pull_request](#mcp_ado_wit_link_work_item_to_pull_request)                 | Link a work item to a pull request                                |
| Work Items        | [mcp_ado_wit_list_work_item_comments](#mcp_ado_wit_list_work_item_comments)                               | List comments on a work item                                      |
| Work Items        | [mcp_ado_wit_add_work_item_comment](#mcp_ado_wit_add_work_item_comment)                                   | Add a comment to a work item                                      |
| Work Items        | [mcp_ado_wit_update_work_item_comment](#mcp_ado_wit_update_work_item_comment)                             | Update an existing comment on a work item                         |
| Work Items        | [mcp_ado_wit_list_work_item_revisions](#mcp_ado_wit_list_work_item_revisions)                             | Get revision history of a work item                               |
| Work Items        | [mcp_ado_wit_get_work_item_type](#mcp_ado_wit_get_work_item_type)                                         | Get details of a work item type                                   |
| Work Items        | [mcp_ado_wit_my_work_items](#mcp_ado_wit_my_work_items)                                                   | List work items relevant to current user                          |
| Work Items        | [mcp_ado_wit_get_work_items_for_iteration](#mcp_ado_wit_get_work_items_for_iteration)                     | Get work items in a specific iteration                            |
| Work Items        | [mcp_ado_wit_list_backlogs](#mcp_ado_wit_list_backlogs)                                                   | List backlogs for a team                                          |
| Work Items        | [mcp_ado_wit_list_backlog_work_items](#mcp_ado_wit_list_backlog_work_items)                               | Get work items in a backlog                                       |
| Work Items        | [mcp_ado_wit_get_query](#mcp_ado_wit_get_query)                                                           | Get a work item query by ID or path                               |
| Work Items        | [mcp_ado_wit_get_query_results_by_id](#mcp_ado_wit_get_query_results_by_id)                               | Execute a query and get results                                   |
| Work Items        | [mcp_ado_wit_query_by_wiql](#mcp_ado_wit_query_by_wiql)                                                   | Execute a WIQL query and return matching work items               |
| Work Items        | [mcp_ado_wit_get_work_item_attachment](#mcp_ado_wit_get_work_item_attachment)                             | Download a work item attachment; save locally or return as base64 |
| Work              | [mcp_ado_work_list_iterations](#mcp_ado_work_list_iterations)                                             | List all iterations in a project                                  |
| Work              | [mcp_ado_work_create_iterations](#mcp_ado_work_create_iterations)                                         | Create new iterations in a project                                |
| Work              | [mcp_ado_work_list_team_iterations](#mcp_ado_work_list_team_iterations)                                   | List iterations assigned to a team                                |
| Work              | [mcp_ado_work_assign_iterations](#mcp_ado_work_assign_iterations)                                         | Assign iterations to a team                                       |
| Work              | [mcp_ado_work_get_iteration_capacities](#mcp_ado_work_get_iteration_capacities)                           | Get capacity for all teams in an iteration                        |
| Work              | [mcp_ado_work_get_team_capacity](#mcp_ado_work_get_team_capacity)                                         | Get capacity for a specific team in iteration                     |
| Work              | [mcp_ado_work_update_team_capacity](#mcp_ado_work_update_team_capacity)                                   | Update team member capacity for iteration                         |
| Work              | [mcp_ado_work_get_team_settings](#mcp_ado_work_get_team_settings)                                         | Get team settings including default iteration and area            |
| Work              | [mcp_ado_work_list_plans](#mcp_ado_work_list_plans)                                                       | List delivery plans for a project                                 |
| Work              | [mcp_ado_work_get_plan](#mcp_ado_work_get_plan)                                                           | Get a single delivery plan by ID                                  |
| Work              | [mcp_ado_work_create_plan](#mcp_ado_work_create_plan)                                                     | Create a new delivery plan                                        |
| Work              | [mcp_ado_work_update_plan](#mcp_ado_work_update_plan)                                                     | Update an existing delivery plan                                  |
| Work              | [mcp_ado_work_delete_plan](#mcp_ado_work_delete_plan)                                                     | Delete a delivery plan                                            |
| Work              | [mcp_ado_work_list_areas](#mcp_ado_work_list_areas)                                                       | List area paths for a project                                     |
| Work              | [mcp_ado_work_create_area](#mcp_ado_work_create_area)                                                     | Create a new area path                                            |
| Work              | [mcp_ado_work_update_area](#mcp_ado_work_update_area)                                                     | Rename an area path                                               |
| Work              | [mcp_ado_work_delete_area](#mcp_ado_work_delete_area)                                                     | Delete an area path (reclassify work items)                       |
| Work              | [mcp_ado_work_update_iteration](#mcp_ado_work_update_iteration)                                           | Update an iteration's name or dates                               |
| Work              | [mcp_ado_work_delete_iteration](#mcp_ado_work_delete_iteration)                                           | Delete an iteration (reclassify work items)                       |
| Work              | [mcp_ado_work_set_team_area_paths](#mcp_ado_work_set_team_area_paths)                                     | Set a team's default and owned area paths                         |
| Work              | [mcp_ado_work_list_boards](#mcp_ado_work_list_boards)                                                     | List a team's boards                                              |
| Work              | [mcp_ado_work_get_board_columns](#mcp_ado_work_get_board_columns)                                         | Get a board's columns                                             |
| Work              | [mcp_ado_work_get_board_rows](#mcp_ado_work_get_board_rows)                                               | Get a board's rows (swimlanes)                                    |
| Work              | [mcp_ado_work_get_backlog_configuration](#mcp_ado_work_get_backlog_configuration)                         | Get a team's backlog configuration                                |
| Work              | [mcp_ado_work_get_team_days_off](#mcp_ado_work_get_team_days_off)                                         | Get a team's days off for an iteration                            |
| Work              | [mcp_ado_work_set_team_days_off](#mcp_ado_work_set_team_days_off)                                         | Set a team's days off for an iteration                            |
| Work              | [mcp_ado_work_update_board_columns](#mcp_ado_work_update_board_columns)                                   | Replace a board's columns                                         |
| Work              | [mcp_ado_work_update_board_rows](#mcp_ado_work_update_board_rows)                                         | Replace a board's rows (swimlanes)                                |
| Work              | [mcp_ado_work_get_board_card_settings](#mcp_ado_work_get_board_card_settings)                             | Get a board's card field settings                                 |
| Work              | [mcp_ado_work_update_board_card_settings](#mcp_ado_work_update_board_card_settings)                       | Update a board's card field settings                              |
| Work              | [mcp_ado_work_get_board_card_rule_settings](#mcp_ado_work_get_board_card_rule_settings)                   | Get a board's card style/rule settings                            |
| Work              | [mcp_ado_work_update_board_card_rule_settings](#mcp_ado_work_update_board_card_rule_settings)             | Update a board's card style/rule settings                         |
| Work              | [mcp_ado_work_list_board_charts](#mcp_ado_work_list_board_charts)                                         | List a board's charts                                             |
| Work              | [mcp_ado_work_get_board_chart](#mcp_ado_work_get_board_chart)                                             | Get a board chart by name                                         |
| Work              | [mcp_ado_work_update_board_chart](#mcp_ado_work_update_board_chart)                                       | Update a board chart                                              |
| Work              | [mcp_ado_work_list_backlogs](#mcp_ado_work_list_backlogs)                                                 | List a team's backlog levels                                      |
| Work              | [mcp_ado_work_get_backlog](#mcp_ado_work_get_backlog)                                                     | Get a backlog level configuration                                 |
| Work              | [mcp_ado_work_get_backlog_work_items](#mcp_ado_work_get_backlog_work_items)                               | Get work items in a backlog level                                 |
| Work              | [mcp_ado_work_get_iteration_work_items](#mcp_ado_work_get_iteration_work_items)                           | Get work items in an iteration                                    |
| Work              | [mcp_ado_work_remove_team_iteration](#mcp_ado_work_remove_team_iteration)                                 | Remove an iteration from a team                                   |
| Work              | [mcp_ado_work_reorder_backlog_work_items](#mcp_ado_work_reorder_backlog_work_items)                       | Reorder work items on a backlog                                   |
| Work              | [mcp_ado_work_reorder_iteration_work_items](#mcp_ado_work_reorder_iteration_work_items)                   | Reorder work items in an iteration                                |
| Work              | [mcp_ado_work_get_board](#mcp_ado_work_get_board)                                                         | Get a board                                                       |
| Work              | [mcp_ado_work_get_board_user_settings](#mcp_ado_work_get_board_user_settings)                             | Get a board's user settings                                       |
| Work              | [mcp_ado_work_get_delivery_timeline](#mcp_ado_work_get_delivery_timeline)                                 | Get delivery timeline (plan) data                                 |
| Work              | [mcp_ado_work_get_process_configuration](#mcp_ado_work_get_process_configuration)                         | Get a project's process configuration                             |
| Work              | [mcp_ado_work_list_predefined_queries](#mcp_ado_work_list_predefined_queries)                             | List predefined portfolio queries                                 |
| Work              | [mcp_ado_work_get_predefined_query_results](#mcp_ado_work_get_predefined_query_results)                   | Get predefined query results                                      |
| Work              | [mcp_ado_work_get_taskboard_columns](#mcp_ado_work_get_taskboard_columns)                                 | Get taskboard columns                                             |
| Work              | [mcp_ado_work_update_taskboard_columns](#mcp_ado_work_update_taskboard_columns)                           | Replace taskboard columns                                         |
| Work              | [mcp_ado_work_get_taskboard_work_item_columns](#mcp_ado_work_get_taskboard_work_item_columns)             | Get per-work-item taskboard columns                               |
| Work              | [mcp_ado_work_update_taskboard_work_item_column](#mcp_ado_work_update_taskboard_work_item_column)         | Move a work item's taskboard column                               |
| Work              | [mcp_ado_work_update_taskboard_card_settings](#mcp_ado_work_update_taskboard_card_settings)               | Update taskboard card field settings                              |
| Work              | [mcp_ado_work_update_taskboard_card_rule_settings](#mcp_ado_work_update_taskboard_card_rule_settings)     | Update taskboard card style/rule settings                         |
| Work              | [mcp_ado_work_get_column_suggested_values](#mcp_ado_work_get_column_suggested_values)                     | Get suggested board column values                                 |
| Work              | [mcp_ado_work_get_row_suggested_values](#mcp_ado_work_get_row_suggested_values)                           | Get suggested board row values                                    |
| Work              | [mcp_ado_work_get_board_mapping_parent_items](#mcp_ado_work_get_board_mapping_parent_items)               | Get parent items mapped to child work items                       |
| Work              | [mcp_ado_work_get_team_member_capacity](#mcp_ado_work_get_team_member_capacity)                           | Get a team member's iteration capacity                            |
| Work              | [mcp_ado_work_replace_team_capacities](#mcp_ado_work_replace_team_capacities)                             | Replace all team capacities for an iteration                      |
| Work              | [mcp_ado_work_update_automation_rule](#mcp_ado_work_update_automation_rule)                               | Enable/disable backlog automation rules                           |
| Dashboards        | [mcp_ado_dashboard_list_dashboards](#mcp_ado_dashboard_list_dashboards)                                   | List dashboards in a project/team                                 |
| Dashboards        | [mcp_ado_dashboard_get_dashboard](#mcp_ado_dashboard_get_dashboard)                                       | Get a dashboard and its widgets                                   |
| Dashboards        | [mcp_ado_dashboard_create_dashboard](#mcp_ado_dashboard_create_dashboard)                                 | Create a dashboard                                                |
| Dashboards        | [mcp_ado_dashboard_replace_dashboard](#mcp_ado_dashboard_replace_dashboard)                               | Replace (update) a dashboard                                      |
| Dashboards        | [mcp_ado_dashboard_delete_dashboard](#mcp_ado_dashboard_delete_dashboard)                                 | Delete a dashboard                                                |
| Dashboards        | [mcp_ado_dashboard_get_widget](#mcp_ado_dashboard_get_widget)                                             | Get a widget on a dashboard                                       |
| Dashboards        | [mcp_ado_dashboard_create_widget](#mcp_ado_dashboard_create_widget)                                       | Add a widget to a dashboard                                       |
| Dashboards        | [mcp_ado_dashboard_update_widget](#mcp_ado_dashboard_update_widget)                                       | Update a widget on a dashboard                                    |
| Dashboards        | [mcp_ado_dashboard_delete_widget](#mcp_ado_dashboard_delete_widget)                                       | Remove a widget from a dashboard                                  |
| Dashboards        | [mcp_ado_dashboard_list_widget_types](#mcp_ado_dashboard_list_widget_types)                               | List available widget types                                       |
| Dashboards        | [mcp_ado_dashboard_get_widget_metadata](#mcp_ado_dashboard_get_widget_metadata)                           | Get widget type metadata by contribution ID                       |
| Policy            | [mcp_ado_policy_list_configurations](#mcp_ado_policy_list_configurations)                                 | List policy configurations                                        |
| Policy            | [mcp_ado_policy_get_configuration](#mcp_ado_policy_get_configuration)                                     | Get a policy configuration                                        |
| Policy            | [mcp_ado_policy_create_configuration](#mcp_ado_policy_create_configuration)                               | Create a policy configuration                                     |
| Policy            | [mcp_ado_policy_update_configuration](#mcp_ado_policy_update_configuration)                               | Update a policy configuration                                     |
| Policy            | [mcp_ado_policy_delete_configuration](#mcp_ado_policy_delete_configuration)                               | Delete a policy configuration                                     |
| Policy            | [mcp_ado_policy_list_types](#mcp_ado_policy_list_types)                                                   | List policy types                                                 |
| Policy            | [mcp_ado_policy_get_type](#mcp_ado_policy_get_type)                                                       | Get a policy type                                                 |
| Policy            | [mcp_ado_policy_list_configuration_revisions](#mcp_ado_policy_list_configuration_revisions)               | List policy configuration revisions                               |
| Policy            | [mcp_ado_policy_get_configuration_revision](#mcp_ado_policy_get_configuration_revision)                   | Get a policy configuration revision                               |
| Policy            | [mcp_ado_policy_list_evaluations](#mcp_ado_policy_list_evaluations)                                       | List policy evaluations for an artifact                           |
| Policy            | [mcp_ado_policy_get_evaluation](#mcp_ado_policy_get_evaluation)                                           | Get a policy evaluation                                           |
| Policy            | [mcp_ado_policy_requeue_evaluation](#mcp_ado_policy_requeue_evaluation)                                   | Requeue a policy evaluation                                       |
| Task Agent        | [mcp_ado_taskagent_list_variable_groups](#mcp_ado_taskagent_list_variable_groups)                         | List variable groups                                              |
| Task Agent        | [mcp_ado_taskagent_get_variable_group](#mcp_ado_taskagent_get_variable_group)                             | Get a variable group                                              |
| Task Agent        | [mcp_ado_taskagent_add_variable_group](#mcp_ado_taskagent_add_variable_group)                             | Create a variable group                                           |
| Task Agent        | [mcp_ado_taskagent_update_variable_group](#mcp_ado_taskagent_update_variable_group)                       | Update a variable group                                           |
| Task Agent        | [mcp_ado_taskagent_delete_variable_group](#mcp_ado_taskagent_delete_variable_group)                       | Delete a variable group                                           |
| Task Agent        | [mcp_ado_taskagent_share_variable_group](#mcp_ado_taskagent_share_variable_group)                         | Share a variable group with projects                              |
| Task Agent        | [mcp_ado_taskagent_list_agent_pools](#mcp_ado_taskagent_list_agent_pools)                                 | List agent pools                                                  |
| Task Agent        | [mcp_ado_taskagent_list_agent_queues](#mcp_ado_taskagent_list_agent_queues)                               | List agent queues                                                 |
| Task Agent        | [mcp_ado_taskagent_list_environments](#mcp_ado_taskagent_list_environments)                               | List environments                                                 |
| Task Agent        | [mcp_ado_taskagent_get_environment](#mcp_ado_taskagent_get_environment)                                   | Get an environment                                                |
| Task Agent        | [mcp_ado_taskagent_add_environment](#mcp_ado_taskagent_add_environment)                                   | Create an environment                                             |
| Task Agent        | [mcp_ado_taskagent_update_environment](#mcp_ado_taskagent_update_environment)                             | Update an environment                                             |
| Task Agent        | [mcp_ado_taskagent_delete_environment](#mcp_ado_taskagent_delete_environment)                             | Delete an environment                                             |

## Advanced Security

### mcp_ado_advsec_get_alerts

Retrieve Advanced Security alerts for a repository.

- **Required**: `project`, `repository`, `confidenceLevels`
- **Optional**: `alertType`, `continuationToken`, `onlyDefaultBranch`, `orderBy`, `ref`, `ruleId`, `ruleName`, `severities`, `states`, `toolName`, `top`, `validity`

### mcp_ado_advsec_get_alert_details

Get detailed information about a specific Advanced Security alert.

- **Required**: `project`, `repository`, `alertId`
- **Optional**: `ref`

## Core

### mcp_ado_core_list_projects

Retrieve a list of projects in your Azure DevOps organization.

- **Required**: None
- **Optional**: `continuationToken`, `projectNameFilter`, `skip`, `stateFilter`, `top`

### mcp_ado_core_list_project_teams

Retrieve a list of teams for the specified Azure DevOps project.

- **Required**: `project`
- **Optional**: `mine`, `skip`, `top`

### mcp_ado_core_get_identity_ids

Retrieve Azure DevOps identity IDs for a provided search filter.

- **Required**: `searchFilter`
- **Optional**: None

### mcp_ado_core_create_project

Create a new project in your Azure DevOps organization. This queues an asynchronous operation and returns an operation reference.

- **Required**: `name`
- **Optional**: `description`, `visibility`, `sourceControlType`, `processTemplate`

### mcp_ado_core_update_project

Update an existing project in your Azure DevOps organization. This queues an asynchronous operation and returns an operation reference.

- **Required**: None
- **Optional**: `project`, `name`, `description`, `visibility`

### mcp_ado_core_delete_project

Permanently delete a project from your Azure DevOps organization. This is a destructive operation that queues an asynchronous delete and returns an operation reference.

- **Required**: None
- **Optional**: `project`

### mcp_ado_core_create_team

Create a new team in an Azure DevOps project.

- **Required**: `name`
- **Optional**: `project`, `description`

### mcp_ado_core_update_team

Update an existing team in an Azure DevOps project.

- **Required**: `team`
- **Optional**: `project`, `name`, `description`

### mcp_ado_core_delete_team

Permanently delete a team from an Azure DevOps project. This is a destructive operation.

- **Required**: `team`
- **Optional**: `project`

### mcp_ado_core_list_processes

List the process templates available in the organization (Agile, Scrum, Basic, CMMI, custom).

- **Required**: None
- **Optional**: None

### mcp_ado_core_list_team_members

List the members of a team.

- **Required**: None
- **Optional**: `project`, `team`, `top`, `skip`

### mcp_ado_core_get_project_properties

Get the properties of a project (optionally filtered by key, wildcards supported).

- **Required**: None
- **Optional**: `project`, `keys`

### mcp_ado_core_set_project_properties

Create or update properties on a project.

- **Required**: `properties`
- **Optional**: `project`

## Pipelines

### mcp_ado_pipelines_create_pipeline

Creates a pipeline definition with YAML configuration for a given project.

- **Required**: `project`, `name`, `yamlPath`, `repositoryType`, `repositoryName`
- **Optional**: `folder`, `repositoryConnectionId`, `repositoryId`

### mcp_ado_pipelines_get_builds

Retrieves a list of builds for a given project.

- **Required**: `project`
- **Optional**: `branchName`, `buildIds`, `buildNumber`, `continuationToken`, `definitions`, `deletedFilter`, `maxBuildsPerDefinition`, `maxTime`, `minTime`, `properties`, `queryOrder`, `queues`, `reasonFilter`, `repositoryId`, `repositoryType`, `requestedFor`, `resultFilter`, `statusFilter`, `tagFilters`, `top`

### mcp_ado_pipelines_get_build_status

Fetches the status of a specific build.

- **Required**: `project`, `buildId`
- **Optional**: None

### mcp_ado_pipelines_get_build_log

Retrieves the logs for a specific build.

- **Required**: `project`, `buildId`
- **Optional**: None

### mcp_ado_pipelines_get_build_log_by_id

Get a specific build log by log ID.

- **Required**: `project`, `buildId`, `logId`
- **Optional**: `endLine`, `startLine`

### mcp_ado_pipelines_get_build_changes

Get the changes associated with a specific build.

- **Required**: `project`, `buildId`
- **Optional**: `continuationToken`, `includeSourceChange`, `top`

### mcp_ado_pipelines_get_build_definitions

Retrieves a list of build definitions for a given project.

- **Required**: `project`
- **Optional**: `builtAfter`, `continuationToken`, `definitionIds`, `includeAllProperties`, `includeLatestBuilds`, `minMetricsTime`, `name`, `notBuiltAfter`, `path`, `processType`, `queryOrder`, `repositoryId`, `repositoryType`, `taskIdFilter`, `top`, `yamlFilename`

### mcp_ado_pipelines_get_build_definition_revisions

Retrieves a list of revisions for a specific build definition.

- **Required**: `project`, `definitionId`
- **Optional**: None

### mcp_ado_pipelines_run_pipeline

Starts a new run of a pipeline.

- **Required**: `project`, `pipelineId`
- **Optional**: `pipelineVersion`, `previewRun`, `resources`, `stagesToSkip`, `templateParameters`, `variables`, `yamlOverride`

### mcp_ado_pipelines_get_run

Gets a run for a particular pipeline.

- **Required**: `project`, `pipelineId`, `runId`
- **Optional**: None

### mcp_ado_pipelines_list_runs

Gets top 10000 runs for a particular pipeline.

- **Required**: `project`, `pipelineId`
- **Optional**: None

### mcp_ado_pipelines_update_build_stage

Updates the stage of a specific build.

- **Required**: `project`, `buildId`, `stageName`, `status`
- **Optional**: `forceRetryAllJobs`

### mcp_ado_pipelines_list_artifacts

Lists artifacts for a given build.

- **Required**: `project`, `buildId`

### mcp_ado_pipelines_download_artifact

Downloads a pipeline artifact.

- **Required**: `project`, `buildId`, `artifactName`
- **Optional**: `destinationPath` (relative local path; absolute paths and path traversal are not allowed)

## Repositories

### mcp_ado_repo_list_repos_by_project

Retrieve a list of repositories for a given project.

- **Required**: `project`
- **Optional**: `repoNameFilter`, `skip`, `top`

### mcp_ado_repo_get_repo_by_name_or_id

Get the repository by project and repository name or ID.

- **Required**: `project`, `repositoryNameOrId`
- **Optional**: None

### mcp_ado_repo_list_branches_by_repo

Retrieve a list of branches for a given repository.

- **Required**: `repositoryId`
- **Optional**: `filterContains`, `top`

### mcp_ado_repo_list_my_branches_by_repo

Retrieve a list of my branches for a given repository Id.

- **Required**: `repositoryId`
- **Optional**: `filterContains`, `top`

### mcp_ado_repo_get_branch_by_name

Get a branch by its name.

- **Required**: `repositoryId`, `branchName`
- **Optional**: None

### mcp_ado_repo_create_branch

Create a new branch in the repository.

- **Required**: `repositoryId`, `branchName`
- **Optional**: `sourceBranchName`, `sourceCommitId`

### mcp_ado_repo_search_commits

Search for commits in a repository with comprehensive filtering capabilities.

- **Required**: `project`, `repository`
- **Optional**: `author`, `authorEmail`, `commitIds`, `committer`, `committerEmail`, `fromCommit`, `fromDate`, `historySimplificationMode`, `includeLinks`, `includeWorkItems`, `searchText`, `skip`, `toCommit`, `toDate`, `top`, `version`, `versionType`

### mcp_ado_repo_list_pull_requests_by_repo_or_project

Retrieve a list of pull requests for a given repository.

- **Required**: None (either `repositoryId` or `project` must be provided)
- **Optional**: `created_by_me`, `created_by_user`, `i_am_reviewer`, `project`, `repositoryId`, `skip`, `sourceRefName`, `status`, `targetRefName`, `top`, `user_is_reviewer`

### mcp_ado_repo_list_pull_requests_by_commits

Lists pull requests by commit IDs to find which pull requests contain specific commits.

- **Required**: `project`, `repository`, `commits`
- **Optional**: `queryType`

### mcp_ado_repo_get_pull_request_by_id

Get a pull request by its ID.

- **Required**: `repositoryId`, `pullRequestId`
- **Optional**: `project`, `includeWorkItemRefs`, `includeLabels`, `includeChangedFiles`

### mcp_ado_repo_get_pull_request_changes

Get the file changes (diff) for a pull request iteration with actual code diff content. Returns the code changes including line-by-line diffs made in the pull request.

- **Required**: `repositoryId`, `pullRequestId`
- **Optional**: `iterationId`, `project`, `top`, `skip`, `compareTo`, `includeDiffs`, `includeLineContent`

**Notes**:

- If `iterationId` is not specified, returns changes for the latest iteration
- Use `compareTo` to get changes between two specific iterations
- Supports pagination with `top` and `skip` parameters
- By default, includes line-by-line diff metadata (line numbers, change types) AND actual code content
- Set `includeDiffs=false` to get only file metadata without diff information
- Set `includeLineContent=false` to exclude actual code lines and get only diff metadata (line numbers, change types)
- The diff content includes `lineDiffBlocks` showing line numbers and change types
- By default, each `lineDiffBlock` includes `originalLines` (from base) and `modifiedLines` (from target) arrays with actual code content

### mcp_ado_repo_create_pull_request

Create a new pull request.

- **Required**: `repositoryId`, `sourceRefName`, `targetRefName`, `title`
- **Optional**: `description`, `forkSourceRepositoryId`, `isDraft`, `labels`, `workItems`

### mcp_ado_repo_update_pull_request

Update a Pull Request by ID with specified fields.

- **Required**: `repositoryId`, `pullRequestId`
- **Optional**: `autoComplete`, `bypassReason`, `deleteSourceBranch`, `description`, `isDraft`, `mergeStrategy`, `status`, `targetRefName`, `title`, `transitionWorkItems`

### mcp_ado_repo_update_pull_request_reviewers

Add or remove reviewers for an existing pull request.

- **Required**: `repositoryId`, `pullRequestId`, `reviewerIds`, `action`
- **Optional**: None

### mcp_ado_repo_vote_pull_request

Cast a vote on a pull request.

- **Required**: `repositoryId`, `pullRequestId`, `vote`
- **Optional**: None

### mcp_ado_repo_list_pull_request_threads

Retrieve a list of comment threads for a pull request.

- **Required**: `repositoryId`, `pullRequestId`
- **Optional**: `baseIteration`, `fullResponse`, `iteration`, `project`, `skip`, `top`

### mcp_ado_repo_list_pull_request_thread_comments

Retrieve a list of comments in a pull request thread.

- **Required**: `repositoryId`, `pullRequestId`, `threadId`
- **Optional**: `fullResponse`, `project`, `skip`, `top`

### mcp_ado_repo_create_pull_request_thread

Creates a new comment thread on a pull request.

- **Required**: `repositoryId`, `pullRequestId`, `content`
- **Optional**: `filePath`, `project`, `rightFileEndLine`, `rightFileEndOffset`, `rightFileStartLine`, `rightFileStartOffset`, `status`

### mcp_ado_repo_update_pull_request_thread

Updates an existing comment thread on a pull request.

- **Required**: `repositoryId`, `pullRequestId`, `threadId`
- **Optional**: `project`, `status`

### mcp_ado_repo_reply_to_comment

Replies to a specific comment on a pull request.

- **Required**: `repositoryId`, `pullRequestId`, `threadId`, `content`
- **Optional**: `fullResponse`, `project`

### mcp_ado_repo_list_directory

List files and folders in a directory within a repository.

- **Required**: `repositoryId`
- **Optional**: `path`, `project`, `version`, `versionType`, `recursive`, `recursionDepth`

### mcp_ado_repo_get_file_content

Get the content of a file from a Git repository at a specific version (branch, tag, or commit SHA).

- **Required**: `repositoryId`, `path`
- **Optional**: `project`, `version`, `versionType`

## Search

### mcp_ado_search_code

Search Azure DevOps Repositories for a given search text.

- **Required**: `searchText`
- **Optional**: `branch`, `includeFacets`, `path`, `project`, `repository`, `skip`, `top`

### mcp_ado_search_wiki

Search Azure DevOps Wiki for a given search text.

- **Required**: `searchText`
- **Optional**: `includeFacets`, `project`, `skip`, `top`, `wiki`

### mcp_ado_search_workitem

Get Azure DevOps Work Item search results for a given search text.

- **Required**: `searchText`
- **Optional**: `areaPath`, `assignedTo`, `includeFacets`, `project`, `skip`, `state`, `top`, `workItemType`

## Test Plans

### mcp_ado_testplan_list_test_plans

Retrieve a paginated list of test plans from an Azure DevOps project.

- **Required**: `project`
- **Optional**: `continuationToken`, `filterActivePlans`, `includePlanDetails`

### mcp_ado_testplan_create_test_plan

Creates a new test plan in the project.

- **Required**: `project`, `name`, `iteration`
- **Optional**: `areaPath`, `description`, `endDate`, `startDate`

### mcp_ado_testplan_list_test_suites

Retrieve a paginated list of test suites from an Azure DevOps project and Test Plan Id. Returns test suites in a properly nested hierarchical structure.

- **Required**: `project`, `planId`
- **Optional**: `continuationToken`

### mcp_ado_testplan_create_test_suite

Creates a new test suite in a test plan.

- **Required**: `project`, `planId`, `parentSuiteId`, `name`
- **Optional**: None

### mcp_ado_testplan_add_test_cases_to_suite

Adds existing test cases to a test suite.

- **Required**: `project`, `planId`, `suiteId`, `testCaseIds`
- **Optional**: None

### mcp_ado_testplan_list_test_cases

Gets a list of test cases in the test plan.

- **Required**: `project`, `planid`, `suiteid`
- **Optional**: `continuationToken`

### mcp_ado_testplan_create_test_case

Creates a new test case work item.

- **Required**: `project`, `title`
- **Optional**: `areaPath`, `iterationPath`, `priority`, `steps`, `testsWorkItemId`

### mcp_ado_testplan_update_test_case_steps

Update an existing test case work item.

- **Required**: `id`, `steps`
- **Optional**: None

### mcp_ado_testplan_show_test_results_from_build_id

Gets a list of test results for a given project and build ID. Can filter by test outcome (e.g. Failed, Passed, Aborted). Returns test case titles, error messages, stack traces, and outcomes.

- **Required**: `project`, `buildid`
- **Optional**: `outcomes`

## Wiki

### mcp_ado_wiki_list_wikis

Retrieve a list of wikis for an organization or project.

- **Required**: None
- **Optional**: `project`

### mcp_ado_wiki_get_wiki

Get the wiki by wikiIdentifier.

- **Required**: `wikiIdentifier`
- **Optional**: `project`

### mcp_ado_wiki_list_pages

Retrieve a list of wiki pages for a specific wiki and project.

- **Required**: `wikiIdentifier`, `project`
- **Optional**: `continuationToken`, `pageViewsForDays`, `top`

### mcp_ado_wiki_get_page

Retrieve wiki page metadata by path. This tool does not return page content.

- **Required**: `wikiIdentifier`, `project`, `path`
- **Optional**: `recursionLevel`

### mcp_ado_wiki_get_page_content

Retrieve wiki page content.

- **Required**: None (either `url` OR `wikiIdentifier` and `project`)
- **Optional**: `path`, `project`, `url`, `wikiIdentifier`

### mcp_ado_wiki_create_or_update_page

Create or update a wiki page with content.

- **Required**: `wikiIdentifier`, `path`, `content`
- **Optional**: `branch`, `etag`, `project`

## Work Items

### mcp_ado_wit_get_work_item

Get a single work item by ID.

- **Required**: `id`, `project`
- **Optional**: `asOf`, `expand`, `fields`

### mcp_ado_wit_get_work_items_batch_by_ids

Retrieve list of work items by IDs in batch.

- **Required**: `project`, `ids`
- **Optional**: `fields`

### mcp_ado_wit_create_work_item

Create a new work item in a specified project and work item type.

- **Required**: `project`, `workItemType`, `fields`
- **Optional**: None

### mcp_ado_wit_update_work_item

Update a work item by ID with specified fields.

- **Required**: `id`, `updates`
- **Optional**: None

### mcp_ado_wit_update_work_items_batch

Update work items in batch.

- **Required**: `updates`
- **Optional**: None

### mcp_ado_wit_add_child_work_items

Create one or many child work items from a parent by work item type and parent id.

- **Required**: `parentId`, `project`, `workItemType`, `items`
- **Optional**: None

### mcp_ado_wit_work_items_link

Link work items together in batch.

- **Required**: `project`, `updates`
- **Optional**: None

### mcp_ado_wit_work_item_unlink

Remove one or many links from a single work item.

- **Required**: `project`, `id`
- **Optional**: `type`, `url`

### mcp_ado_wit_add_artifact_link

Add artifact links (repository, branch, commit, builds) to work items.

- **Required**: `workItemId`, `project`
- **Optional**: `artifactUri`, `branchName`, `buildId`, `comment`, `commitId`, `linkType`, `projectId`, `pullRequestId`, `repositoryId`

### mcp_ado_wit_link_work_item_to_pull_request

Link a single work item to an existing pull request.

- **Required**: `projectId`, `repositoryId`, `pullRequestId`, `workItemId`
- **Optional**: `pullRequestProjectId`

### mcp_ado_wit_list_work_item_comments

Retrieve list of comments for a work item by ID.

- **Required**: `project`, `workItemId`
- **Optional**: `top`

### mcp_ado_wit_add_work_item_comment

Add comment to a work item by ID.

- **Required**: `project`, `workItemId`, `comment`
- **Optional**: `format`

### mcp_ado_wit_update_work_item_comment

Update an existing comment on a work item by ID.

- **Required**: `project`, `workItemId`, `commentId`, `text`
- **Optional**: `format`

### mcp_ado_wit_list_work_item_revisions

Retrieve list of revisions for a work item by ID.

- **Required**: `project`, `workItemId`
- **Optional**: `expand`, `skip`, `top`

### mcp_ado_wit_get_work_item_type

Get a specific work item type.

- **Required**: `project`, `workItemType`
- **Optional**: None

### mcp_ado_wit_my_work_items

Retrieve a list of work items relevant to the authenticated user.

- **Required**: `project`
- **Optional**: `includeCompleted`, `top`, `type`

### mcp_ado_wit_get_work_items_for_iteration

Retrieve a list of work items for a specified iteration.

- **Required**: `project`, `iterationId`
- **Optional**: `team`

### mcp_ado_wit_list_backlogs

Receive a list of backlogs for a given project and team.

- **Required**: `project`, `team`
- **Optional**: None

### mcp_ado_wit_list_backlog_work_items

Retrieve a list of backlogs for a given project, team, and backlog category.

- **Required**: `project`, `team`, `backlogId`
- **Optional**: None

### mcp_ado_wit_get_query

Get a query by its ID or path.

- **Required**: `project`, `query`
- **Optional**: `depth`, `expand`, `includeDeleted`, `useIsoDateFormat`

### mcp_ado_wit_get_query_results_by_id

Retrieve the results of a work item query given the query ID.

- **Required**: `id`
- **Optional**: `project`, `responseType`, `team`, `timePrecision`, `top`

### mcp_ado_wit_query_by_wiql

Execute a WIQL (Work Item Query Language) query and return the matching work items. If a project is not specified, you will be prompted to select one.

- **Required**: `wiql`
- **Optional**: `project`, `team`, `timePrecision`, `top`

### mcp_ado_wit_get_work_item_attachment

Download a work item attachment by its ID. If `savePath` is provided, saves the file to that local directory and returns the file path. Otherwise returns the content as a base64-encoded resource. Useful for viewing images (e.g. screenshots) or other files attached to work items such as bugs.

- **Required**: `attachmentId`
- **Optional**: `project`, `fileName`, `savePath`

## Work

### mcp_ado_work_list_iterations

List all iterations in a specified Azure DevOps project.

- **Required**: `project`
- **Optional**: `depth`, `excludedIds`

### mcp_ado_work_create_iterations

Create new iterations in a specified Azure DevOps project.

- **Required**: `project`, `iterations`
- **Optional**: None

### mcp_ado_work_list_team_iterations

Retrieve a list of iterations for a specific team in a project.

- **Required**: `project`, `team`
- **Optional**: `timeframe`

### mcp_ado_work_assign_iterations

Assign existing iterations to a specific team in a project.

- **Required**: `project`, `team`, `iterations`
- **Optional**: None

### mcp_ado_work_get_iteration_capacities

Get an iteration's capacity for all teams in iteration and project.

- **Required**: `project`, `iterationId`
- **Optional**: None

### mcp_ado_work_get_team_capacity

Get the team capacity of a specific team and iteration in a project.

- **Required**: `project`, `team`, `iterationId`
- **Optional**: None

### mcp_ado_work_update_team_capacity

Update the team capacity of a team member for a specific iteration in a project.

- **Required**: `project`, `team`, `teamMemberId`, `iterationId`, `activities`
- **Optional**: `daysOff`

### mcp_ado_work_get_team_settings

Get team settings including default iteration, backlog iteration, and default area path for a team.

- **Required**: `project`
- **Optional**: `team`

### mcp_ado_work_list_plans

Retrieve a list of delivery plans for an Azure DevOps project.

- **Required**: None
- **Optional**: `project`

### mcp_ado_work_get_plan

Retrieve a single delivery plan by ID for an Azure DevOps project.

- **Required**: `id`
- **Optional**: `project`

### mcp_ado_work_create_plan

Create a new delivery plan in an Azure DevOps project.

- **Required**: `name`
- **Optional**: `project`, `description`, `properties`

### mcp_ado_work_update_plan

Update an existing delivery plan in an Azure DevOps project.

- **Required**: `id`, `revision`
- **Optional**: `project`, `name`, `description`, `properties`

### mcp_ado_work_delete_plan

Permanently delete a delivery plan from an Azure DevOps project. This is a destructive operation.

- **Required**: `id`
- **Optional**: `project`

### mcp_ado_work_list_areas

List the area paths for an Azure DevOps project.

- **Required**: None
- **Optional**: `project`, `depth`

### mcp_ado_work_create_area

Create a new area path in an Azure DevOps project.

- **Required**: `name`
- **Optional**: `project`, `parentPath`

### mcp_ado_work_update_area

Rename an existing area path in an Azure DevOps project.

- **Required**: `path`, `name`
- **Optional**: `project`

### mcp_ado_work_delete_area

Permanently delete an area path. Work items under the deleted area are reclassified to the area identified by `reclassifyId`. This is a destructive operation.

- **Required**: `path`, `reclassifyId`
- **Optional**: `project`

### mcp_ado_work_update_iteration

Update an existing iteration's name and/or start/finish dates.

- **Required**: `path`
- **Optional**: `project`, `name`, `startDate`, `finishDate`

### mcp_ado_work_delete_iteration

Permanently delete an iteration. Work items under the deleted iteration are reclassified to the iteration identified by `reclassifyId`. This is a destructive operation.

- **Required**: `path`, `reclassifyId`
- **Optional**: `project`

### mcp_ado_work_set_team_area_paths

Set the area paths owned by a team (the default area path and/or the full set of owned area paths).

- **Required**: None
- **Optional**: `project`, `team`, `defaultAreaPath`, `areaPaths`

### mcp_ado_work_list_boards

List the boards for a team.

- **Required**: None
- **Optional**: `project`, `team`

### mcp_ado_work_get_board_columns

Get the columns of a board.

- **Required**: `board`
- **Optional**: `project`, `team`

### mcp_ado_work_get_board_rows

Get the rows (swimlanes) of a board.

- **Required**: `board`
- **Optional**: `project`, `team`

### mcp_ado_work_get_backlog_configuration

Get a team's backlog configuration (portfolio/requirement/task backlogs and their work item types).

- **Required**: None
- **Optional**: `project`, `team`

### mcp_ado_work_get_team_days_off

Get a team's days off for a specific iteration.

- **Required**: `iterationId`
- **Optional**: `project`, `team`

### mcp_ado_work_set_team_days_off

Set a team's days off for a specific iteration (replaces the existing set).

- **Required**: `iterationId`, `daysOff`
- **Optional**: `project`, `team`

### mcp_ado_work_update_board_columns

Replace a board's columns. Fetch the current columns with `work_get_board_columns`, edit, and pass back the full set.

- **Required**: `board`, `columns`
- **Optional**: `project`, `team`

### mcp_ado_work_update_board_rows

Replace a board's rows (swimlanes). Fetch the current rows with `work_get_board_rows`, edit, and pass back the full set.

- **Required**: `board`, `rows`
- **Optional**: `project`, `team`

### mcp_ado_work_get_board_card_settings

Get a board's card field settings.

- **Required**: `board`
- **Optional**: `project`, `team`

### mcp_ado_work_update_board_card_settings

Update a board's card field settings (fetch via `work_get_board_card_settings`, edit, pass back the full object).

- **Required**: `board`, `cardSettings`
- **Optional**: `project`, `team`

### mcp_ado_work_get_board_card_rule_settings

Get a board's card style/rule settings.

- **Required**: `board`
- **Optional**: `project`, `team`

### mcp_ado_work_update_board_card_rule_settings

Update a board's card style/rule settings (fetch via `work_get_board_card_rule_settings`, edit, pass back the full object).

- **Required**: `board`, `ruleSettings`
- **Optional**: `project`, `team`

### mcp_ado_work_list_board_charts

List the charts available on a board.

- **Required**: `board`
- **Optional**: `project`, `team`

### mcp_ado_work_get_board_chart

Get a specific board chart by name.

- **Required**: `board`, `name`
- **Optional**: `project`, `team`

### mcp_ado_work_update_board_chart

Update a board chart by name (fetch via `work_get_board_chart`, edit, pass back the full object).

- **Required**: `board`, `name`, `chart`
- **Optional**: `project`, `team`

### mcp_ado_work_list_backlogs

List the backlog levels (e.g. Epics, Features, Stories) configured for a team.

- **Required**: none
- **Optional**: `project`, `team`

### mcp_ado_work_get_backlog

Get the configuration of a specific backlog level for a team.

- **Required**: `id`
- **Optional**: `project`, `team`

### mcp_ado_work_get_backlog_work_items

Get the work items belonging to a specific backlog level for a team.

- **Required**: `backlogId`
- **Optional**: `project`, `team`

### mcp_ado_work_get_iteration_work_items

Get the work items assigned to a specific iteration for a team.

- **Required**: `iterationId`
- **Optional**: `project`, `team`

### mcp_ado_work_remove_team_iteration

Remove (unassign) an iteration from a team. Does not delete the iteration from the project.

- **Required**: `id`
- **Optional**: `project`, `team`

### mcp_ado_work_reorder_backlog_work_items

Reorder work items on a team's backlog.

- **Required**: `ids`
- **Optional**: `project`, `team`, `previousId`, `nextId`, `parentId`, `iterationPath`

### mcp_ado_work_reorder_iteration_work_items

Reorder work items within a team's iteration.

- **Required**: `iterationId`, `ids`
- **Optional**: `project`, `team`, `previousId`, `nextId`, `parentId`, `iterationPath`

### mcp_ado_work_get_board

Get a board (including its columns, rows and allowed mappings) for a team.

- **Required**: `id`
- **Optional**: `project`, `team`

### mcp_ado_work_get_board_user_settings

Get the current user's settings for a board (e.g. which swimlanes are collapsed).

- **Required**: `board`
- **Optional**: `project`, `team`

### mcp_ado_work_get_delivery_timeline

Get the delivery timeline (delivery plan) data for a plan.

- **Required**: `id`
- **Optional**: `project`, `revision`, `startDate`, `endDate`

### mcp_ado_work_get_process_configuration

Get the process configuration (backlog levels, fields and work item types) for a project.

- **Required**: none
- **Optional**: `project`

### mcp_ado_work_list_predefined_queries

List the predefined queries available for a project's portfolio backlogs.

- **Required**: none
- **Optional**: `project`

### mcp_ado_work_get_predefined_query_results

Get the results of a predefined query for a project's portfolio backlogs.

- **Required**: `id`
- **Optional**: `project`, `top`, `includeCompleted`

### mcp_ado_work_get_taskboard_columns

Get the taskboard (sprint board) columns for a team.

- **Required**: none
- **Optional**: `project`, `team`

### mcp_ado_work_update_taskboard_columns

Replace the taskboard columns for a team. Fetch the current columns via `work_get_taskboard_columns`, edit, and pass back the full set.

- **Required**: `columns`
- **Optional**: `project`, `team`

### mcp_ado_work_get_taskboard_work_item_columns

Get the taskboard column assignment for each work item in an iteration.

- **Required**: `iterationId`
- **Optional**: `project`, `team`

### mcp_ado_work_update_taskboard_work_item_column

Move a work item to a different taskboard column within an iteration.

- **Required**: `iterationId`, `workItemId`, `newColumn`
- **Optional**: `project`, `team`

### mcp_ado_work_update_taskboard_card_settings

Update the taskboard card field settings for a team.

- **Required**: `cardSettings`
- **Optional**: `project`, `team`

### mcp_ado_work_update_taskboard_card_rule_settings

Update the taskboard card style/rule settings for a team.

- **Required**: `ruleSettings`
- **Optional**: `project`, `team`

### mcp_ado_work_get_column_suggested_values

Get the suggested values that can be used for board columns in a project.

- **Required**: none
- **Optional**: `project`

### mcp_ado_work_get_row_suggested_values

Get the suggested values that can be used for board rows (swimlanes) in a project.

- **Required**: none
- **Optional**: `project`

### mcp_ado_work_get_board_mapping_parent_items

Get the parent work items mapped to a set of child work items for a board.

- **Required**: `childBacklogContextCategoryRefName`, `workItemIds`
- **Optional**: `project`, `team`

### mcp_ado_work_get_team_member_capacity

Get the capacity of a specific team member for an iteration.

- **Required**: `iterationId`, `teamMemberId`
- **Optional**: `project`, `team`

### mcp_ado_work_replace_team_capacities

Replace the capacities of all team members for an iteration (overwrites the entire set).

- **Required**: `iterationId`, `capacities`
- **Optional**: `project`, `team`

### mcp_ado_work_update_automation_rule

Enable or disable a team's backlog automation rules for a backlog level.

- **Required**: `rulesStates`
- **Optional**: `project`, `team`, `backlogLevelName`

## 📊 Dashboards

### mcp_ado_dashboard_list_dashboards

List the dashboards in a project (or team).

- **Required**: none
- **Optional**: `project`, `team`

### mcp_ado_dashboard_get_dashboard

Get a specific dashboard (including its widgets) by ID.

- **Required**: `dashboardId`
- **Optional**: `project`, `team`

### mcp_ado_dashboard_create_dashboard

Create a new dashboard in a project (or team).

- **Required**: `dashboard`
- **Optional**: `project`, `team`

### mcp_ado_dashboard_replace_dashboard

Replace (fully update) an existing dashboard. Fetch the current dashboard via `dashboard_get_dashboard`, edit, and pass back the full object.

- **Required**: `dashboardId`, `dashboard`
- **Optional**: `project`, `team`

### mcp_ado_dashboard_delete_dashboard

Delete a dashboard by ID.

- **Required**: `dashboardId`
- **Optional**: `project`, `team`

### mcp_ado_dashboard_get_widget

Get a specific widget on a dashboard.

- **Required**: `dashboardId`, `widgetId`
- **Optional**: `project`, `team`

### mcp_ado_dashboard_create_widget

Add a widget to a dashboard. Use `dashboard_list_widget_types` to discover the contribution ID and default sizing.

- **Required**: `dashboardId`, `widget`
- **Optional**: `project`, `team`

### mcp_ado_dashboard_update_widget

Update a widget on a dashboard. Fetch the current widget via `dashboard_get_widget`, edit, and pass back the full object.

- **Required**: `dashboardId`, `widgetId`, `widget`
- **Optional**: `project`, `team`

### mcp_ado_dashboard_delete_widget

Remove a widget from a dashboard. Returns the updated dashboard.

- **Required**: `dashboardId`, `widgetId`
- **Optional**: `project`, `team`

### mcp_ado_dashboard_list_widget_types

List the widget types available to add to dashboards, including their contribution ID and default sizing.

- **Required**: none
- **Optional**: `project`, `scope` (`project_team` | `collection_user`)

### mcp_ado_dashboard_get_widget_metadata

Get the metadata for a widget type by its contribution ID.

- **Required**: `contributionId`
- **Optional**: `project`

## 🛡️ Policy

### mcp_ado_policy_list_configurations

List the policy configurations in a project, optionally filtered by scope (repository) or policy type.

- **Required**: none
- **Optional**: `project`, `scope`, `policyType`

### mcp_ado_policy_get_configuration

Get a specific policy configuration by ID.

- **Required**: `configurationId`
- **Optional**: `project`

### mcp_ado_policy_create_configuration

Create a new policy configuration (e.g. a branch policy). Use `policy_list_types` to discover type IDs and settings.

- **Required**: `configuration`
- **Optional**: `project`

### mcp_ado_policy_update_configuration

Update an existing policy configuration. Fetch via `policy_get_configuration`, edit, and pass back the full object.

- **Required**: `configurationId`, `configuration`
- **Optional**: `project`

### mcp_ado_policy_delete_configuration

Delete a policy configuration by ID.

- **Required**: `configurationId`
- **Optional**: `project`

### mcp_ado_policy_list_types

List the policy types available in a project.

- **Required**: none
- **Optional**: `project`

### mcp_ado_policy_get_type

Get a specific policy type by ID.

- **Required**: `typeId`
- **Optional**: `project`

### mcp_ado_policy_list_configuration_revisions

List the revisions of a policy configuration.

- **Required**: `configurationId`
- **Optional**: `project`, `top`, `skip`

### mcp_ado_policy_get_configuration_revision

Get a specific revision of a policy configuration.

- **Required**: `configurationId`, `revisionId`
- **Optional**: `project`

### mcp_ado_policy_list_evaluations

List the policy evaluations for an artifact (e.g. a pull request).

- **Required**: `artifactId`
- **Optional**: `project`, `includeNotApplicable`, `top`, `skip`

### mcp_ado_policy_get_evaluation

Get a specific policy evaluation record by ID.

- **Required**: `evaluationId`
- **Optional**: `project`

### mcp_ado_policy_requeue_evaluation

Requeue (re-run) a policy evaluation by ID.

- **Required**: `evaluationId`
- **Optional**: `project`

## 🤖 Task Agent

### mcp_ado_taskagent_list_variable_groups

List the variable groups in a project.

- **Required**: none
- **Optional**: `project`, `groupName`, `top`

### mcp_ado_taskagent_get_variable_group

Get a specific variable group by ID.

- **Required**: `groupId`
- **Optional**: `project`

### mcp_ado_taskagent_add_variable_group

Create a new variable group. The parameters must include `variableGroupProjectReferences` specifying the target project(s).

- **Required**: `variableGroup`
- **Optional**: none

### mcp_ado_taskagent_update_variable_group

Update an existing variable group. Fetch via `taskagent_get_variable_group`, build the parameters, and pass them back.

- **Required**: `groupId`, `variableGroup`
- **Optional**: none

### mcp_ado_taskagent_delete_variable_group

Delete a variable group from the specified project(s).

- **Required**: `groupId`, `projectIds`
- **Optional**: none

### mcp_ado_taskagent_share_variable_group

Share a variable group with additional projects.

- **Required**: `variableGroupId`, `projectReferences`
- **Optional**: none

### mcp_ado_taskagent_list_agent_pools

List the agent pools in the organization.

- **Required**: none
- **Optional**: `poolName`

### mcp_ado_taskagent_list_agent_queues

List the agent queues in a project.

- **Required**: none
- **Optional**: `project`, `queueName`

### mcp_ado_taskagent_list_environments

List the environments (deployment targets) in a project.

- **Required**: none
- **Optional**: `project`, `name`, `top`

### mcp_ado_taskagent_get_environment

Get a specific environment by ID.

- **Required**: `environmentId`
- **Optional**: `project`

### mcp_ado_taskagent_add_environment

Create a new environment in a project.

- **Required**: `name`
- **Optional**: `project`, `description`

### mcp_ado_taskagent_update_environment

Update an existing environment's name or description.

- **Required**: `environmentId`
- **Optional**: `project`, `name`, `description`

### mcp_ado_taskagent_delete_environment

Delete an environment by ID.

- **Required**: `environmentId`
- **Optional**: `project`
