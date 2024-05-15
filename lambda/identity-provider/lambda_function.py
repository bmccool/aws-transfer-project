# GetUserConfig Python Lambda with LOGICAL HomeDirectoryDetails
import json

def lambda_handler(event, context):
  print("Username: {}, ServerId: {}, sourceIP: {}".format(event['username'], event['serverId'], event['sourceIp']))

  response = {}

  # Check if the username presented for authentication is correct. This doesn't check the value of the server ID, only that it is provided.
  if event['serverId'] != '' and event['username'] == 'ovc-camera':
    homeDirectoryDetails = [
      {
        'Entry': '/',
        'Target': '/ovc-video-test'
      }
    ]
    response = {
      'Role': 'arn:aws:iam::104168354287:role/aws-video-transfer-role', # The user will be authenticated if and only if the Role field is not blank
      'HomeDirectoryDetails': json.dumps(homeDirectoryDetails),
      'HomeDirectoryType': "LOGICAL"
    }

    # Check if password is provided
    if event.get('password', '') == '':
      print("No password")
      # Return HTTP status 200 but with no role in the response to indicate authentication failure
      response = {}
    # Check if password is correct
    elif event['password'] != 'testpass1234':
      # Return HTTP status 200 but with no role in the response to indicate authentication failure
      print("Incorrect password")
      response = {}
  else:
    # Return HTTP status 200 but with no role in the response to indicate authentication failure
    print("Wrong Server or username")
    response = {}

  return response