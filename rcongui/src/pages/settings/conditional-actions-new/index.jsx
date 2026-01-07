import {
  Form,
  json,
  useActionData,
  useLoaderData,
  useRevalidator,
  useSubmit,
} from "react-router-dom";
import { lazy, Suspense, useEffect, useState } from "react";
import { execute, get, handleHttpError } from "@/utils/fetchUtils";
import { Box, Button, Stack, Typography, useTheme } from "@mui/material";
import { a11yDark, a11yLight, CopyBlock } from "react-code-blocks";
import { toast } from "react-toastify";
import { red } from "@mui/material/colors";
import { JsonForms } from "@jsonforms/react";
import {
  materialCells,
  materialRenderers,
} from "@jsonforms/material-renderers";
import { Generate } from "@jsonforms/core";
import ButtonGroup from "@mui/material/ButtonGroup";
import { customRenderers } from "@/pages/settings/[configs]/renderer/renderer";

const Editor = lazy(() => import("@monaco-editor/react"));

export const loader = async () => {
  let data, schema;

  let response;
  try {
    response = await get(`get_conditional_actions_config`);
  } catch (error) {
    handleHttpError(error);
  }

  data = await response.json();
  if (!data || data.failed)
    throw new Response("Could not load config data", { status: 400 });

  try {
    response = await get(`describe_conditional_actions_config`);
    schema = await response.json();
    if (!schema || schema.failed) throw new Error();
  } catch (error) {
    throw new Response("Could not load schema data", { status: 400 });
  }

  return {
    data: data.result,
    schema: schema.result,
  };
};

export const action = async ({ request }) => {
  let formData = await request.formData();
  let config = formData.get("config");
  let error = null;
  let response;

  if (!config) return { ok: false, error: "Missing parameters" };

  config = JSON.parse(config);

  try {
    response = await execute(`validate_conditional_actions_config`, {
      errors_as_json: true,
      ...config,
    });
  } catch (error) {
    handleHttpError(error);
  }

  const data = await response.json();

  if (!data || data.failed) {
    throw json(
      {
        message: "Server failed to validate config data.",
        error: data?.error,
        command: data?.command,
      },
      { status: 400 }
    );
  }

  error = data.error;

  if (error) {
    return { ok: false, error };
  }

  response = await execute(`set_conditional_actions_config`, config);

  return { ok: true };
};

const ConditionalActionsPage = () => {
  const { data, schema } = useLoaderData();
  const [validationErrors, setValidationErrors] = useState(null);
  const [jsonData, setJsonData] = useState(data);
  const [editorContent, setEditorContent] = useState("");
  const [mode, setMode] = useState("visual");
  const revalidator = useRevalidator();
  const actionData = useActionData();
  const submit = useSubmit();
  const theme = useTheme();

  useEffect(() => {
    setEditorContent(JSON.stringify(data, null, 2));
    setJsonData(data);
  }, [data]);

  useEffect(() => {
    if (actionData && actionData.ok === false) {
      setValidationErrors(actionData.error);
      toast.error("Conditional Actions config saving failed!");
    } else if (actionData && actionData.ok) {
      setValidationErrors(null);
      toast.success("Conditional Actions config saved!");
    }
  }, [actionData]);

  const handleSubmit = (e) => {
    const formData = new FormData();
    formData.append("config", editorContent);
    submit(formData, { method: "post" });
    e.preventDefault();
  };

  const handleRefresh = () => {
    revalidator.revalidate();
    setValidationErrors(null);
  };

  function updateMode(newMode) {
    if (newMode === "visual") {
      try {
        setJsonData(JSON.parse(editorContent));
      } catch (e) {
        setValidationErrors("Invalid JSON: " + e);
      }
    } else if (jsonData) {
      setEditorContent(JSON.stringify(jsonData, null, 2));
    }
    setMode(newMode);
  }

  return (
    <Stack direction={"column"} spacing={4}>
      <Form method="post" onSubmit={handleSubmit}>
        <Stack direction={"row"} justifyContent={"space-between"}>
          <Typography variant="h3">Conditional Actions</Typography>
          <ButtonGroup variant="outlined">
            <Button
              variant={mode === "visual" ? "contained" : "outlined"}
              onClick={() => updateMode("visual")}
            >
              Visual
            </Button>
            <Button
              variant={mode === "code" ? "contained" : "outlined"}
              onClick={() => updateMode("code")}
            >
              Code
            </Button>
          </ButtonGroup>
        </Stack>
        <Stack spacing={2} direction={"column"}>
          {validationErrors && (
            <Box sx={{ mb: 2 }}>
              <CopyBlock
                wrapLongLines
                text={JSON.stringify(validationErrors, null, 2)}
                language="json"
                theme={theme.palette.mode === "dark" ? a11yDark : a11yLight}
                customStyle={{ border: `2px solid ${red["600"]}` }}
              />
            </Box>
          )}
          {mode === "visual" ? (
            <Box
              sx={{
                "& .MuiFormControl-root": {
                  marginTop: "14px",
                },
              }}
            >
              <JsonForms
                data={jsonData}
                onChange={({ data }) => {
                  setEditorContent(JSON.stringify(data, null, 2));
                  setJsonData(data);
                }}
                sx={{
                  "& .jfa-label": {
                    fontSize: "14px",
                  },
                }}
                schema={schema}
                uischema={Generate.uiSchema(schema)}
                renderers={[...customRenderers, ...materialRenderers]}
                cells={materialCells}
              />
            </Box>
          ) : (
            <Suspense>
              <Editor
                height="70vh"
                defaultLanguage="json"
                value={editorContent}
                defaultValue=""
                theme={theme.palette.mode === "dark" ? "vs-dark" : "vs-light"}
                onChange={(value) => setEditorContent(value)}
              />
            </Suspense>
          )}
          <Stack direction={"row"} spacing={1}>
            <Button variant={"outlined"} onClick={handleRefresh}>
              Refresh
            </Button>
            <Button variant={"contained"} type="submit">
              Submit
            </Button>
          </Stack>
        </Stack>
      </Form>
      {mode === "code" && (
        <>
          <Typography variant="h4">Documentation</Typography>
          <CopyBlock
            wrapLongLines
            text={conditionalActionsDocumentation}
            language="json"
            wrapLines
            theme={theme.palette.mode === "dark" ? a11yDark : a11yLight}
          />
          <Typography variant="h4">Model Schema</Typography>
          <CopyBlock
            wrapLongLines
            text={JSON.stringify(schema, null, 2)}
            language="json"
            wrapLines
            theme={theme.palette.mode === "dark" ? a11yDark : a11yLight}
          />
        </>
      )}
    </Stack>
  );
};

const conditionalActionsDocumentation = `
{
    /*
        Conditional Actions System
        
        This system allows you to create automated rules that execute actions
        based on player and game conditions when specific events occur.
        
        Features:
        - Trigger on events: player connect/disconnect, kills, match start/end, etc.
        - Multiple conditions with logical operators (AND, OR, NAND, NOR)
        - Various actions: message, kick, ban, punish, flag, watchlist, etc.
        - Cooldowns and execution limits per player
        - Special "always_true" condition for unconditional actions
    */
    "enabled": false,  // Master switch for the entire system
    
    "rules": [
        {
            "id": "rule_unique_id_123",  // Unique identifier
            "name": "Welcome Message",
            "description": "Send welcome message to all connecting players",
            "enabled": true,
            
            "trigger_event": "player_connected",  // When to evaluate this rule
            
            "logical_operator": "and",  // How to combine conditions: and, or, nand, nor
            
            "conditions": [
                {
                    "field": "always_true",  // Use this for unconditional actions
                    "operator": "equal",
                    "value": true
                }
            ],
            
            "actions": [
                {
                    "action_type": "message_player",
                    "parameters": {
                        "message": "Welcome to our server! Have fun!"
                    }
                }
            ],
            
            "cooldown_seconds": 0,  // Min seconds between executions (0 = no cooldown)
            "max_executions_per_player": 0  // Max executions per player (0 = unlimited)
        }
    ]
}
`;

export default ConditionalActionsPage;

