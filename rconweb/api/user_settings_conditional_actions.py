from django.views.decorators.csrf import csrf_exempt

from rcon.user_config.conditional_actions import ConditionalActionsUserConfig

from .auth import api_response, login_required
from .decorators import permission_required, require_http_methods


@csrf_exempt
@login_required()
@permission_required("api.can_view_conditional_actions_config", raise_exception=True)
@require_http_methods(["GET"])
def describe_conditional_actions_config(request):
    command_name = "describe_conditional_actions_config"

    return api_response(
        result=ConditionalActionsUserConfig.model_json_schema(),
        command=command_name,
        failed=False,
    )

