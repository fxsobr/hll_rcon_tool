import { lazy, Suspense, useEffect, useState } from "react";
import { Await, defer, useLoaderData, useSubmit, useRevalidator } from "react-router-dom";
import { cmd } from "@/utils/fetchUtils";
import { AsyncClientError } from "@/components/shared/AsyncClientError";
import {
  Box,
  Button,
  ButtonGroup,
  Skeleton,
  Stack,
  Typography,
  IconButton,
  Chip,
  Alert,
  AlertTitle,
  Checkbox,
  Switch,
  FormControlLabel,
  Card,
  CardContent,
  Tooltip,
  useTheme,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { DataGrid } from "@mui/x-data-grid";
import { toast } from "react-toastify";
import RuleDialog from "./RuleDialog";

const Editor = lazy(() => import("@monaco-editor/react"));

export const loader = async () => {
  const config = cmd.GET_CONDITIONAL_ACTIONS_CONFIG();
  return defer({ config });
};

export const action = async ({ request }) => {
  const payload = await request.json();
  const result = await cmd.SET_CONDITIONAL_ACTIONS_CONFIG({ payload });
  return result;
};

const ConfigSkeleton = () => <Skeleton height={400} />;

const ConditionalActionsPage = () => {
  const data = useLoaderData();
  const submit = useSubmit();
  const revalidator = useRevalidator();
  const [config, setConfig] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);
  const [mode, setMode] = useState("visual");
  const [editorContent, setEditorContent] = useState("");
  const [editorError, setEditorError] = useState(null);
  const theme = useTheme();

  useEffect(() => {
    if (data.config) {
      data.config.then((cfg) => {
        setConfig(cfg);
        setEditorContent(JSON.stringify(cfg, null, 2));
      });
    }
  }, [data.config]);

  const updateMode = (newMode) => {
    if (newMode === "visual") {
      // Parse editor content back to config
      try {
        const parsed = JSON.parse(editorContent);
        setConfig(parsed);
        setEditorError(null);
      } catch (e) {
        setEditorError("Invalid JSON: " + e.message);
        return; // Don't switch mode if JSON is invalid
      }
    } else {
      // Serialize config to editor content
      setEditorContent(JSON.stringify(config, null, 2));
      setEditorError(null);
    }
    setMode(newMode);
  };

  const handleSaveFromCode = () => {
    try {
      const parsed = JSON.parse(editorContent);
      setEditorError(null);
      handleSaveConfig(parsed);
    } catch (e) {
      setEditorError("Invalid JSON: " + e.message);
      toast.error("Invalid JSON — please fix the syntax error");
    }
  };

  const handleSaveConfig = (newConfig) => {
    submit(newConfig, { method: "post", encType: "application/json" });
    setConfig(newConfig);
    setEditorContent(JSON.stringify(newConfig, null, 2));
    toast.success("Configuration saved successfully!");
  };

  const handleAddRule = () => {
    setEditingRule(null);
    setEditingIndex(null);
    setDialogOpen(true);
  };

  const handleEditRule = (rule, index) => {
    setEditingRule(rule);
    setEditingIndex(index);
    setDialogOpen(true);
  };

  const handleDeleteRule = (index) => {
    if (!window.confirm("Are you sure you want to delete this rule?")) {
      return;
    }

    const newRules = [...(config?.rules || [])];
    newRules.splice(index, 1);
    const newConfig = { ...config, rules: newRules };
    handleSaveConfig(newConfig);
  };

  const handleToggleSystem = () => {
    const newConfig = { ...config, enabled: !config.enabled };
    handleSaveConfig(newConfig);
  };

  const handleToggleRule = (index) => {
    const newRules = [...(config?.rules || [])];
    newRules[index] = { ...newRules[index], enabled: !newRules[index].enabled };
    const newConfig = { ...config, rules: newRules };
    handleSaveConfig(newConfig);
  };

  const handleSaveRule = (rule) => {
    const newRules = [...(config?.rules || [])];
    if (editingIndex !== null) {
      newRules[editingIndex] = rule;
    } else {
      newRules.push(rule);
    }
    const newConfig = { ...config, rules: newRules };
    handleSaveConfig(newConfig);
    setDialogOpen(false);
  };

  const columns = [
    {
      field: "priority",
      headerName: "Priority",
      width: 80,
      align: "center",
      headerAlign: "center",
    },
    {
      field: "enabled",
      headerName: "Status",
      width: 100,
      align: "center",
      headerAlign: "center",
      renderCell: (params) => (
        <Switch
          checked={params.value}
          onChange={() => handleToggleRule(params.row.index)}
          size="small"
          color="primary"
        />
      ),
    },
    {
      field: "name",
      headerName: "Rule Name",
      flex: 1,
      minWidth: 220,
      renderCell: (params) => (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            height: '100%',
          }}
        >
          <Typography variant="body2" fontWeight={500}>
            {params.value}
          </Typography>
          {params.row.description && (
            <Typography variant="caption" color="text.secondary" noWrap>
              {params.row.description}
            </Typography>
          )}
        </Box>
      ),
    },
    {
      field: "trigger_event",
      headerName: "Trigger Event",
      width: 180,
      renderCell: (params) => (
        <Chip
          label={params.value.replace(/_/g, ' ')}
          size="small"
          color="primary"
          variant="outlined"
          sx={{ fontWeight: 500 }}
        />
      ),
    },
    {
      field: "conditions",
      headerName: "Conditions",
      width: 130,
      align: "center",
      headerAlign: "center",
      valueGetter: (value) => value?.length || 0,
      renderCell: (params) => (
        <Chip
          label={`${params.value}`}
          size="small"
          color="default"
          sx={{ minWidth: 40 }}
        />
      ),
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 120,
      align: "center",
      headerAlign: "center",
      valueGetter: (value) => value?.length || 0,
      renderCell: (params) => (
        <Chip
          label={`${params.value}`}
          size="small"
          color="default"
          sx={{ minWidth: 40 }}
        />
      ),
    },
    {
      field: "logical_operator",
      headerName: "Logic",
      width: 100,
      align: "center",
      headerAlign: "center",
      renderCell: (params) => (
        <Chip
          label={params.value.toUpperCase()}
          size="small"
          variant="outlined"
          sx={{ fontWeight: 600 }}
        />
      ),
    },
    {
      field: "edit",
      headerName: "",
      width: 120,
      align: "center",
      headerAlign: "center",
      sortable: false,
      renderCell: (params) => (
        <Stack
          direction="row"
          spacing={0.5}
          sx={{ height: '100%', alignItems: 'center', justifyContent: 'center' }}
        >
          <Tooltip title="Edit rule">
            <IconButton
              size="small"
              onClick={() => handleEditRule(params.row.rule, params.row.index)}
              color="primary"
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete rule">
            <IconButton
              size="small"
              color="error"
              onClick={() => handleDeleteRule(params.row.index)}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ];

  const rows =
    config?.rules?.map((rule, index) => ({
      id: index,
      index,
      rule,
      ...rule,
    })) || [];

  return (
    <Stack direction="column" spacing={4}>
      {/* Header: title + Visual/Code toggle (matches [configs]/detail.jsx pattern) */}
      <Stack direction="row" justifyContent="space-between" alignItems="center">
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

      <Stack spacing={2}>
        {/* Enable toggle + Add Rule (only in visual mode) */}
        {mode === "visual" && (
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <FormControlLabel
              control={
                <Checkbox
                  checked={config?.enabled || false}
                  onChange={handleToggleSystem}
                  disabled={!config}
                  color="primary"
                />
              }
              label="Enable"
            />
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleAddRule}
              disabled={!config}
            >
              Add Rule
            </Button>
          </Stack>
        )}

        {/* Validation errors (code mode) */}
        {editorError && (
          <Alert severity="error" onClose={() => setEditorError(null)}>
            <AlertTitle>Invalid JSON</AlertTitle>
            {editorError}
          </Alert>
        )}

        {/* Rules Table (Visual) or JSON Editor (Code) */}
        <Suspense fallback={<ConfigSkeleton />}>
          <Await
            resolve={data.config}
            errorElement={<AsyncClientError title={"Conditional Actions Config"} />}
          >
            {() => mode === "visual" ? (
              <Card elevation={2}>
                <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                  <DataGrid
                    rows={rows}
                    columns={columns}
                    initialState={{
                      pagination: {
                        paginationModel: { pageSize: 10 },
                      },
                    }}
                    pageSizeOptions={[10, 25, 50, 100]}
                    disableRowSelectionOnClick
                    checkboxSelection={false}
                    autoHeight
                    sx={{
                      border: 'none',
                      '& .MuiDataGrid-cell:focus': {
                        outline: 'none',
                      },
                      '& .MuiDataGrid-row:hover': {
                        backgroundColor: 'action.hover',
                      },
                      '& .MuiDataGrid-columnHeaders': {
                        backgroundColor: 'background.default',
                        borderBottom: 2,
                        borderColor: 'divider',
                      },
                    }}
                  />
                </CardContent>
              </Card>
            ) : (
              <Card elevation={2}>
                <CardContent>
                  <Stack spacing={2}>
                    <Alert severity="info" icon={<InfoOutlinedIcon />}>
                      <AlertTitle>Code mode</AlertTitle>
                      Edit the full configuration as JSON. Be careful — invalid JSON or invalid structure will be rejected on save.
                    </Alert>
                    <Suspense fallback={<Skeleton height={500} />}>
                      <Editor
                        height="70vh"
                        defaultLanguage="json"
                        value={editorContent}
                        theme={theme.palette.mode === "dark" ? "vs-dark" : "vs-light"}
                        onChange={(value) => setEditorContent(value || "")}
                        options={{
                          minimap: { enabled: false },
                          fontSize: 13,
                          tabSize: 2,
                          formatOnPaste: true,
                          scrollBeyondLastLine: false,
                        }}
                      />
                    </Suspense>
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <Button
                        variant="outlined"
                        onClick={() => {
                          setEditorContent(JSON.stringify(config, null, 2));
                          setEditorError(null);
                        }}
                      >
                        Reset
                      </Button>
                      <Button
                        variant="contained"
                        onClick={handleSaveFromCode}
                      >
                        Save JSON
                      </Button>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            )}
          </Await>
        </Suspense>


      </Stack>

      {dialogOpen && (
        <RuleDialog
          open={dialogOpen}
          rule={editingRule}
          onClose={() => setDialogOpen(false)}
          onSave={handleSaveRule}
        />
      )}
    </Stack>
  );
};

export default ConditionalActionsPage;

