import { Suspense, useEffect, useState } from "react";
import { Await, defer, useLoaderData, useSubmit, useRevalidator } from "react-router-dom";
import { cmd } from "@/utils/fetchUtils";
import { AsyncClientError } from "@/components/shared/AsyncClientError";
import {
  Box,
  Button,
  Paper,
  Skeleton,
  Stack,
  Typography,
  IconButton,
  Chip,
  Alert,
  AlertTitle,
  Switch,
  FormControlLabel,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import { DataGrid } from "@mui/x-data-grid";
import { toast } from "react-toastify";
import RuleDialog from "./RuleDialog";

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

  useEffect(() => {
    if (data.config) {
      data.config.then((cfg) => {
        setConfig(cfg);
      });
    }
  }, [data.config]);

  const handleSaveConfig = (newConfig) => {
    submit(newConfig, { method: "post", encType: "application/json" });
    setConfig(newConfig);
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
      field: "enabled",
      headerName: "Status",
      width: 100,
      renderCell: (params) => (
        <IconButton
          size="small"
          onClick={() => handleToggleRule(params.row.index)}
          color={params.value ? "success" : "default"}
        >
          {params.value ? <PlayArrowIcon /> : <PauseIcon />}
        </IconButton>
      ),
    },
    {
      field: "name",
      headerName: "Name",
      flex: 1,
      minWidth: 200,
    },
    {
      field: "trigger_event",
      headerName: "Trigger",
      width: 180,
      renderCell: (params) => (
        <Chip label={params.value} size="small" color="primary" variant="outlined" />
      ),
    },
    {
      field: "conditions",
      headerName: "Conditions",
      width: 120,
      valueGetter: (value) => value?.length || 0,
      renderCell: (params) => (
        <Chip label={`${params.value} condition(s)`} size="small" />
      ),
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 120,
      valueGetter: (value) => value?.length || 0,
      renderCell: (params) => (
        <Chip label={`${params.value} action(s)`} size="small" color="secondary" />
      ),
    },
    {
      field: "logical_operator",
      headerName: "Logic",
      width: 100,
      renderCell: (params) => (
        <Chip label={params.value} size="small" variant="outlined" />
      ),
    },
    {
      field: "edit",
      headerName: "Edit",
      width: 100,
      sortable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={1}>
          <IconButton
            size="small"
            onClick={() => handleEditRule(params.row.rule, params.row.index)}
          >
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            color="error"
            onClick={() => handleDeleteRule(params.row.index)}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
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
    <Box sx={{ maxWidth: "100%", height: "calc(100vh - 200px)" }}>
      <Stack spacing={2} sx={{ height: "100%" }}>
        <Paper sx={{ p: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="h5" gutterBottom>
                Conditional Actions
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Create automated rules that trigger actions based on player and game conditions
              </Typography>
            </Box>
            <Stack direction="row" spacing={2} alignItems="center">
              <FormControlLabel
                control={
                  <Switch
                    checked={config?.enabled || false}
                    onChange={handleToggleSystem}
                    disabled={!config}
                    color="primary"
                  />
                }
                label={config?.enabled ? "System Enabled" : "System Disabled"}
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
          </Stack>
        </Paper>

        <Alert severity="info">
          <AlertTitle>How it works</AlertTitle>
          Rules are evaluated when specific events occur (player join, kill, match start, etc.).
          When all conditions are met, the configured actions are executed automatically.
        </Alert>

        <Suspense fallback={<ConfigSkeleton />}>
          <Await
            resolve={data.config}
            errorElement={<AsyncClientError title={"Conditional Actions Config"} />}
          >
            {() => (
              <Paper sx={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
                <DataGrid
                  rows={rows}
                  columns={columns}
                  pageSize={10}
                  rowsPerPageOptions={[10, 25, 50]}
                  disableSelectionOnClick
                  autoHeight={false}
                  sx={{ flexGrow: 1 }}
                />
              </Paper>
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
    </Box>
  );
};

export default ConditionalActionsPage;

