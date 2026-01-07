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
  Card,
  CardContent,
  CardHeader,
  Divider,
  Tooltip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import RuleIcon from "@mui/icons-material/Rule";
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
      align: "center",
      headerAlign: "center",
      renderCell: (params) => (
        <Tooltip title={params.value ? "Click to disable" : "Click to enable"}>
          <IconButton
            size="small"
            onClick={() => handleToggleRule(params.row.index)}
            color={params.value ? "success" : "default"}
            sx={{
              '&:hover': {
                backgroundColor: params.value ? 'success.light' : 'action.hover',
              }
            }}
          >
            {params.value ? <PlayArrowIcon /> : <PauseIcon />}
          </IconButton>
        </Tooltip>
      ),
    },
    {
      field: "name",
      headerName: "Rule Name",
      flex: 1,
      minWidth: 220,
      renderCell: (params) => (
        <Box>
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
          color="info"
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
          color="secondary"
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
      headerName: "Actions",
      width: 120,
      align: "center",
      headerAlign: "center",
      sortable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={0.5}>
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
    <Box sx={{ p: 3 }}>
      <Stack spacing={3}>
        {/* Header Card */}
        <Card elevation={3}>
          <CardHeader
            avatar={<RuleIcon color="primary" fontSize="large" />}
            title={
              <Typography variant="h4" component="h1">
                Conditional Actions
              </Typography>
            }
            subheader="Create automated rules that trigger actions based on player and game conditions"
            action={
              <Stack direction="row" spacing={2} alignItems="center">
                <FormControlLabel
                  control={
                    <Switch
                      checked={config?.enabled || false}
                      onChange={handleToggleSystem}
                      disabled={!config}
                      color="success"
                      size="medium"
                    />
                  }
                  label={
                    <Chip
                      label={config?.enabled ? "System Enabled" : "System Disabled"}
                      color={config?.enabled ? "success" : "default"}
                      size="small"
                    />
                  }
                />
                <Button
                  variant="contained"
                  size="large"
                  startIcon={<AddIcon />}
                  onClick={handleAddRule}
                  disabled={!config}
                  sx={{ minWidth: 140 }}
                >
                  Add Rule
                </Button>
              </Stack>
            }
          />
        </Card>

        {/* Info Alert */}
        <Alert
          severity="info"
          icon={<InfoOutlinedIcon />}
          sx={{
            borderRadius: 2,
            '& .MuiAlert-message': { width: '100%' }
          }}
        >
          <AlertTitle sx={{ fontWeight: 600 }}>How it works</AlertTitle>
          <Typography variant="body2">
            Rules are evaluated when specific events occur (player connect/disconnect, kills, match start/end, etc.).
            When all conditions match according to the logical operator, the configured actions are executed automatically.
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            <strong>Tip:</strong> Use the "always_true" condition field to create unconditional actions that execute for all players.
          </Typography>
        </Alert>

        {/* Rules Table */}
        <Suspense fallback={<ConfigSkeleton />}>
          <Await
            resolve={data.config}
            errorElement={<AsyncClientError title={"Conditional Actions Config"} />}
          >
            {() => (
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
                    disableSelectionOnClick
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
            )}
          </Await>
        </Suspense>

        {/* Stats Card */}
        {config && (
          <Card elevation={1} sx={{ backgroundColor: 'background.default' }}>
            <CardContent>
              <Stack direction="row" spacing={4} justifyContent="center">
                <Box textAlign="center">
                  <Typography variant="h4" color="primary">
                    {config.rules?.length || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total Rules
                  </Typography>
                </Box>
                <Divider orientation="vertical" flexItem />
                <Box textAlign="center">
                  <Typography variant="h4" color="success.main">
                    {config.rules?.filter(r => r.enabled).length || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Active Rules
                  </Typography>
                </Box>
                <Divider orientation="vertical" flexItem />
                <Box textAlign="center">
                  <Typography variant="h4" color="text.secondary">
                    {config.rules?.filter(r => !r.enabled).length || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Inactive Rules
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        )}
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

